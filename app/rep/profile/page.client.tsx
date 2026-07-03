"use client"

import { RepDashboardLayout } from "@/components/dashboard/rep-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Save } from "lucide-react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { useToast } from "@/hooks/use-toast"
import type { RepWorkspaceData } from "@/lib/data/workspace-types"

export function RepProfileClient({ initialData, isDemoMode }: { initialData: RepWorkspaceData; isDemoMode: boolean }) {
  const { toast } = useToast()
  const router = useRouter()
  const data = initialData
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  })
  const [baselineName, setBaselineName] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const name = data.viewer?.name ?? data.currentRep?.name ?? ""
    setFormData({
      name,
      email: data.viewer?.email ?? data.currentRep?.email ?? "",
    })
    setBaselineName(name)
  }, [data.currentRep?.email, data.currentRep?.name, data.viewer?.email, data.viewer?.name])

  const hasChanges = formData.name.trim() !== baselineName.trim()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    const trimmedName = formData.name.trim()

    if (!trimmedName) {
      toast({
        title: "Name required",
        description: "Enter your name before saving.",
        variant: "destructive",
      })
      return
    }

    if (isDemoMode) {
      toast({
        title: "Demo mode",
        description: "Profile edits are disabled while demo data is on.",
      })
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch("/api/live/rep/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save profile")
      }

      router.refresh()
      setBaselineName(trimmedName)
      toast({
        title: "Profile updated",
        description: "Your rep profile is up to date.",
      })
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unable to save profile.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const roleLabel = data.currentRep?.role ?? "Sales Rep"

  return (
    <RepDashboardLayout>
      <div className="p-4 md:p-6 lg:p-10 font-sans">
        <div className="mb-10 max-w-2xl">
          <div className="mb-4 inline-flex items-center rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
            <span className="font-mono uppercase tracking-[0.2em] text-muted-foreground">Profile</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">Update your profile</h1>
        </div>

        <div className="max-w-2xl space-y-8">
          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl md:p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-lime/5 blur-3xl" />
            <div className="relative">
              <h2 className="text-xl font-semibold tracking-tight">Profile</h2>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</label>
                  <Input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="rounded-xl border border-border/50 bg-background/50 px-4 py-6 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                  />
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
                  <Input
                    type="email"
                    name="email"
                    value={formData.email}
                    disabled
                    className="rounded-xl border border-border/50 bg-background/30 px-4 py-6 text-sm text-muted-foreground outline-none"
                  />
                </div>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges}
                  className="gap-2 rounded-xl bg-lime px-8 py-6 text-sm font-semibold text-lime-950 shadow-[0_4px_14px_0_rgba(163,230,53,0.39)] transition-all hover:-translate-y-[1px] hover:bg-lime/90 hover:shadow-[0_6px_20px_rgba(163,230,53,0.23)]"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl md:p-8">
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-lime/5 blur-3xl" />
            <div className="relative">
              <h2 className="text-xl font-semibold tracking-tight">Access</h2>
              <div className="mt-6 space-y-4">
                <div className="overflow-hidden rounded-2xl border border-border/40 bg-surface/30 p-5 transition-colors hover:bg-surface/50">
                  <p className="text-sm font-semibold text-foreground/90">Role</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{roleLabel}</p>
                </div>
                <div className="pt-2">
                  <SignOutButton
                    variant="outline"
                    className="rounded-xl border-destructive/20 bg-destructive/5 px-6 py-6 text-sm font-medium text-destructive backdrop-blur-sm transition-colors hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RepDashboardLayout>
  )
}
