import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { getLiveManagerWorkspaceData, getLivePlaybookBySlug, getLiveViewerContext } from "@/lib/data/live-workspace"
import { updatePlaybookSetupForWorkspace } from "@/lib/data/live-write"
import type { BuilderBlobSource } from "@/lib/data/live-write"
import type { PlaybookRecord } from "@/lib/playcall-data"
import { createAdminClient } from "@/lib/supabase/admin"

function formatElapsedDuration(milliseconds: number) {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const viewer = await getLiveViewerContext("manager")
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { slug } = await context.params
  // reps needs full workspace data anyway, so the lighter getLivePlaybookBySlug saves nothing here.
  const data = await getLiveManagerWorkspaceData()
  const playbook = data.playbooks.find((item) => item.slug === slug) ?? null

  if (!playbook) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const admin = createAdminClient()
  const sourceDocumentIds = playbook.sourceDocuments.map((source) => source.id)
  const { data: jobs } = await admin
    .from("processing_jobs")
    .select("entity_type, entity_id, job_type, status, completed_at")
    .eq("workspace_id", viewer.workspaceId)
    .or(
      sourceDocumentIds.length > 0
        ? `and(entity_type.eq.playbook,entity_id.eq.${playbook.id}),and(entity_type.eq.playbook_source_document,entity_id.in.(${sourceDocumentIds.join(",")}))`
        : `and(entity_type.eq.playbook,entity_id.eq.${playbook.id})`
    )
  const { data: playbookMeta } = await admin.from("playbooks").select("created_at, processing_status, processing_error").eq("id", playbook.id).maybeSingle()

  const sourceCounts = {
    total: playbook.sourceDocuments.length,
    attached: playbook.sourceDocuments.filter((source) => source.status === "attached").length,
    processing: playbook.sourceDocuments.filter((source) => source.status === "processing").length,
    failed: playbook.sourceDocuments.filter((source) => source.status === "failed").length,
  }

  const rubricJobActive = (jobs ?? []).some(
    (job) => job.entity_type === "playbook" && job.job_type === "rubric_generation" && (job.status === "queued" || job.status === "processing")
  )
  const createdAtMs = playbookMeta?.created_at ? new Date(playbookMeta.created_at).getTime() : null
  const firstCompletedRubricAtMs =
    createdAtMs === null
      ? null
      : (jobs ?? [])
          .filter(
            (job) =>
              job.entity_type === "playbook" &&
              job.entity_id === playbook.id &&
              job.job_type === "rubric_generation" &&
              job.status === "completed" &&
              typeof job.completed_at === "string"
          )
          .map((job) => new Date(job.completed_at as string).getTime())
          .sort((left, right) => left - right)[0] ?? null
  const elapsedLabel =
    createdAtMs !== null && firstCompletedRubricAtMs !== null ? formatElapsedDuration(firstCompletedRubricAtMs - createdAtMs) : null

  const liveProcessingStatus = (playbookMeta?.processing_status ?? playbook.processingStatus) as PlaybookRecord["processingStatus"]
  const liveProcessingError = playbookMeta?.processing_error ?? playbook.processingError ?? null

  const processingProgress =
    liveProcessingStatus === "failed"
      ? {
          phase: "failed" as const,
          title: "Rubric generation failed",
          detail: liveProcessingError ?? "Playcall could not finish processing this playbook.",
          sourceCounts,
        }
      : liveProcessingStatus === "ready"
        ? {
            phase: "ready" as const,
            title: "Rubric ready",
            detail: elapsedLabel
              ? `Source processing and rubric generation completed in ${elapsedLabel}.`
              : "Source processing and rubric generation are complete.",
            sourceCounts,
            elapsedLabel,
          }
        : sourceCounts.processing > 0
          ? {
              phase: "ingesting_sources" as const,
              title: "Ingesting source material",
              detail: `Processing ${sourceCounts.processing} source ${sourceCounts.processing === 1 ? "document" : "documents"} before rubric generation can start.`,
              sourceCounts,
            }
          : rubricJobActive
            ? {
                phase: "generating_rubric" as const,
                title: "Generating rubric",
                detail: "Source material is ready. Playcall is drafting the rubric now.",
                sourceCounts,
              }
            : sourceCounts.total > 0
              ? {
                  phase: "waiting_for_rubric" as const,
                  title: "Waiting to start rubric generation",
                  detail: "Source material has been uploaded. Waiting for the rubric job to begin.",
                  sourceCounts,
                }
              : {
                  phase: "uploading" as const,
                  title: "Uploading source material",
                  detail: "Saving this playbook and preparing source documents.",
                  sourceCounts,
                }

  return NextResponse.json({
    playbook: {
      ...playbook,
      processingProgress,
    },
    reps: data.reps,
  })
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const viewer = await getLiveViewerContext("manager")

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { slug } = await context.params
  const admin = createAdminClient()

  const { data: playbook, error: playbookError } = await admin
    .from("playbooks")
    .select("id, status")
    .eq("workspace_id", viewer.workspaceId)
    .eq("slug", slug)
    .maybeSingle()

  if (playbookError) {
    return NextResponse.json({ error: playbookError.message }, { status: 400 })
  }

  if (!playbook) {
    return NextResponse.json({ error: "Playbook not found" }, { status: 404 })
  }

  const body = await request.json().catch(() => null)

  if (body?.action === "sources") {
    try {
      const blobSources: BuilderBlobSource[] = Array.isArray(body.blobSources)
        ? body.blobSources.filter((item: unknown): item is BuilderBlobSource => {
            if (typeof item !== "object" || item === null) return false
            const src = item as BuilderBlobSource
            if (typeof src.url !== "string" || typeof src.name !== "string") return false
            try {
              const parsed = new URL(src.url)
              return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com")
            } catch {
              return false
            }
          })
        : []

      const updated = await updatePlaybookSetupForWorkspace({
        workspaceId: viewer.workspaceId,
        playbookId: playbook.id,
        payload: {
          name: typeof body.name === "string" ? body.name : "",
          description: typeof body.description === "string" ? body.description : "",
          segment: typeof body.segment === "string" ? body.segment : "",
          methodology: typeof body.methodology === "string" ? body.methodology : "",
          callTypes: Array.isArray(body.callTypes) ? body.callTypes : [],
          notes: typeof body.notes === "string" ? body.notes : "",
          categories: [],
          uploadedFiles: [],
          blobSources,
        },
      })

      revalidateTag(`workspace-${viewer.workspaceId}`, "max")
      return NextResponse.json({
        playbookId: updated.id,
        slug: updated.slug,
        processingStatus: updated.processingStatus,
      })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to update playbook sources" },
        { status: 400 }
      )
    }
  }

  if (body?.action === "status" && typeof body?.status === "string") {
    const nextStatus = body.status
    const { error } = await admin
      .from("playbooks")
      .update({
        status: nextStatus,
        published_at: nextStatus === "published" ? new Date().toISOString() : null,
        archived_at: nextStatus === "archived" ? new Date().toISOString() : null,
      })
      .eq("id", playbook.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    revalidateTag(`workspace-${viewer.workspaceId}`, "max")
    return NextResponse.json({ ok: true, status: playbook.status })
  }

  if (body?.action === "assignments" && Array.isArray(body?.userIds)) {
    const candidateIds = [...new Set(body.userIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0))]

    const { data: members } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", viewer.workspaceId)
      .in("user_id", candidateIds.length > 0 ? candidateIds : [""])
    const memberSet = new Set((members ?? []).map((m) => m.user_id))
    const userIds = candidateIds.filter((id) => memberSet.has(id))

    // Insert before delete: without a transaction, insert failure preserves the old set.
    const { data: currentAssignments } = await admin
      .from("playbook_assignments")
      .select("user_id")
      .eq("workspace_id", viewer.workspaceId)
      .eq("playbook_id", playbook.id)

    const currentUserIds = new Set((currentAssignments ?? []).map((a) => a.user_id))
    const toAdd = userIds.filter((id) => !currentUserIds.has(id))
    const toRemove = [...currentUserIds].filter((id) => !userIds.includes(id))

    if (toAdd.length > 0) {
      const { error: insertError } = await admin.from("playbook_assignments").insert(
        toAdd.map((userId) => ({
          workspace_id: viewer.workspaceId,
          playbook_id: playbook.id,
          user_id: userId,
          assigned_by: viewer.viewer.id,
        }))
      )

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 })
      }
    }

    if (toRemove.length > 0) {
      const { error: deleteError } = await admin
        .from("playbook_assignments")
        .delete()
        .eq("workspace_id", viewer.workspaceId)
        .eq("playbook_id", playbook.id)
        .in("user_id", toRemove)

      if (deleteError) {
        revalidateTag(`workspace-${viewer.workspaceId}`, "max")
        return NextResponse.json({ error: deleteError.message }, { status: 400 })
      }
    }

    revalidateTag(`workspace-${viewer.workspaceId}`, "max")
    return NextResponse.json({ ok: true })
  }

  if (body?.action === "rubric" && Array.isArray(body?.categories)) {
    const categories = body.categories
      .filter((category: any) => typeof category?.name === "string" && category.name.trim().length > 0)
      .map((category: any, index: number) => ({
        id: typeof category.id === "string" ? category.id : `generated-${index}`,
        name: category.name.trim(),
        weight: Number(category.weight ?? 0),
        criteria: Array.isArray(category.criteria)
          ? category.criteria
              .filter((criterion: unknown): criterion is string => typeof criterion === "string" && criterion.trim().length > 0)
              .map((criterion: string) => criterion.trim())
          : [],
      }))

    const { data: existingCategories, error: existingCategoriesError } = await admin
      .from("playbook_categories")
      .select("id")
      .eq("playbook_id", playbook.id)

    if (existingCategoriesError) {
      return NextResponse.json({ error: existingCategoriesError.message }, { status: 400 })
    }

    const existingCategoryIds = (existingCategories ?? []).map((category) => category.id)

    if (existingCategoryIds.length > 0) {
      const { error: deleteCriteriaError } = await admin
        .from("playbook_criteria")
        .delete()
        .in("playbook_category_id", existingCategoryIds)

      if (deleteCriteriaError) {
        return NextResponse.json({ error: deleteCriteriaError.message }, { status: 400 })
      }

      const { error: deleteCategoriesError } = await admin
        .from("playbook_categories")
        .delete()
        .eq("playbook_id", playbook.id)

      if (deleteCategoriesError) {
        return NextResponse.json({ error: deleteCategoriesError.message }, { status: 400 })
      }
    }

    for (let index = 0; index < categories.length; index += 1) {
      const category = categories[index]
      const { data: createdCategory, error: categoryError } = await admin
        .from("playbook_categories")
        .insert({
          playbook_id: playbook.id,
          workspace_id: viewer.workspaceId,
          name: category.name,
          weight: category.weight,
          position: index,
        })
        .select("id")
        .single()

      if (categoryError || !createdCategory) {
        return NextResponse.json({ error: categoryError?.message ?? "Unable to save rubric category" }, { status: 400 })
      }

      if (category.criteria.length > 0) {
        const { error: criteriaError } = await admin.from("playbook_criteria").insert(
          category.criteria.map((criterion: string, criterionIndex: number) => ({
            playbook_category_id: createdCategory.id,
            workspace_id: viewer.workspaceId,
            criterion,
            position: criterionIndex,
          }))
        )

        if (criteriaError) {
          return NextResponse.json({ error: criteriaError.message }, { status: 400 })
        }
      }
    }

    revalidateTag(`workspace-${viewer.workspaceId}`, "max")
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unsupported update action" }, { status: 400 })
}

export async function POST(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const viewer = await getLiveViewerContext("manager")

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { slug } = await context.params
  const admin = createAdminClient()
  const source = await getLivePlaybookBySlug(slug)

  if (!source) {
    return NextResponse.json({ error: "Playbook not found" }, { status: 404 })
  }

  const duplicateSlug = `${source.slug}-copy-${Date.now().toString().slice(-6)}`
  const { data: duplicate, error: duplicateError } = await admin
    .from("playbooks")
    .insert({
      workspace_id: viewer.workspaceId,
      name: `${source.name} Copy`,
      slug: duplicateSlug,
      description: source.description || null,
      target_segment: source.segment || null,
      methodology: source.methodology || null,
      status: "draft",
      processing_status: "ready",
      applicable_call_types: source.callTypes,
      source_types: source.sourceTypes.map((type) => type.toLowerCase()),
      created_by: viewer.viewer.id,
    })
    .select("id, slug")
    .single()

  if (duplicateError || !duplicate) {
    return NextResponse.json({ error: duplicateError?.message ?? "Unable to duplicate playbook" }, { status: 400 })
  }

  for (let index = 0; index < source.categories.length; index += 1) {
    const category = source.categories[index]
    const { data: createdCategory, error: categoryError } = await admin
      .from("playbook_categories")
      .insert({
        playbook_id: duplicate.id,
        workspace_id: viewer.workspaceId,
        name: category.name,
        weight: category.weight,
        position: index,
      })
      .select("id")
      .single()

    if (categoryError || !createdCategory) {
      return NextResponse.json({ error: categoryError?.message ?? "Unable to duplicate playbook category" }, { status: 400 })
    }

    if (category.criteria.length > 0) {
      const { error: criteriaError } = await admin.from("playbook_criteria").insert(
        category.criteria.map((criterion, criterionIndex) => ({
          playbook_category_id: createdCategory.id,
          workspace_id: viewer.workspaceId,
          criterion,
          position: criterionIndex,
        }))
      )

      if (criteriaError) {
        return NextResponse.json({ error: criteriaError.message }, { status: 400 })
      }
    }
  }

  revalidateTag(`workspace-${viewer.workspaceId}`, "max")
  return NextResponse.json({ ok: true, slug: duplicate.slug })
}
