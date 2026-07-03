"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { PlaybookBuilder, type BuilderCompletionResult } from "@/components/playbook-builder"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { IncompleteSetupBanner } from "@/components/dashboard/incomplete-setup-banner"
import type { ManagerWorkspaceData } from "@/lib/data/workspace-types"

export function NewPlaybookPageClient({ initialData, isDemoMode }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const router = useRouter()
  const { toast } = useToast()

  const data = initialData

  const handleComplete = async (result: BuilderCompletionResult) => {
    if (result.mode === "demo") {
      toast({
        title: result.status === "published" ? "Playbook published" : "Playbook saved",
        description:
          result.status === "published"
            ? "The playbook has been published."
            : "The playbook has been saved as a draft.",
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
      router.push("/manager/playbooks")
      return
    }

    toast({
      title: result.status === "published" ? "Playbook published" : "Playbook created",
      description:
        result.status === "published"
          ? "The playbook was published after rubric generation completed."
          : "The playbook has been saved as a draft.",
      className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
    })
    router.push(`/manager/playbooks/${result.slug}`)
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 lg:p-10 font-sans flex flex-col items-center">
        <div className="w-full max-w-4xl">
          <IncompleteSetupBanner missingProviderRoles={data.missingProviderRoles ?? []} />
        </div>
        <PlaybookBuilder mode={isDemoMode ? "demo" : "live"} onComplete={handleComplete} submitLabel="Publish Playbook" />
      </div>
    </DashboardLayout>
  )
}

export default function NewPlaybookPage() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 lg:p-10 font-sans flex flex-col items-center">
        <PlaybookBuilder mode="demo" onComplete={async () => {}} submitLabel="Publish Playbook" />
      </div>
    </DashboardLayout>
  )
}
