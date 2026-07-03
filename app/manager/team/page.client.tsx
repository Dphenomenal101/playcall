"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Mail, Trash2, Search, Users, Copy, Link2, UserPlus, AlertCircle } from "lucide-react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { createWorkspaceSignInLink } from "@/lib/auth/invite"
import type { ManagerWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Reps separate emails any way that's natural - newlines, commas, or just
// spaces. Split on all of them, then validate each token so a typo or
// non-email entry gets surfaced instead of silently being sent as-is.
function parseInviteEmails(raw: string) {
  const tokens = raw.split(/[\s,;]+/).map((token) => token.trim()).filter(Boolean)
  const valid: string[] = []
  const invalid: string[] = []

  for (const token of tokens) {
    if (EMAIL_PATTERN.test(token)) {
      valid.push(token.toLowerCase())
    } else {
      invalid.push(token)
    }
  }

  return { valid: Array.from(new Set(valid)), invalid }
}

function TeamPageInner({ initialData, isDemoMode }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const data = initialData
  const router = useRouter()
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmails, setInviteEmails] = useState("")
  const [inviteRole, setInviteRole] = useState("Sales Rep")
  const [selectedPlaybooks, setSelectedPlaybooks] = useState<string[]>([])
  const [isSendingInvites, setIsSendingInvites] = useState(false)

  const [team, setTeam] = useState(data.reps)
  const [invites, setInvites] = useState(data.invites)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: "rep" | "invite" } | null>(null)

  useEffect(() => {
    if (isInviteOpen) {
      setSelectedPlaybooks([])
      setInviteEmails("")
      setInviteRole("Sales Rep")
    }
  }, [isInviteOpen])

  const activeTeam = isDemoMode ? team : data.reps
  const activeInvites = isDemoMode ? invites : data.invites
  const viewer = data.viewer

  const filteredTeam = activeTeam.filter(rep =>
    rep.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rep.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const { valid: validInviteEmails, invalid: invalidInviteEmails } = parseInviteEmails(inviteEmails)
  const isMissingPlaybooks = inviteRole === "Sales Rep" && selectedPlaybooks.length === 0
  const showPlaybookError = isMissingPlaybooks && validInviteEmails.length > 0 && invalidInviteEmails.length === 0
  const canSendInvites = !isSendingInvites && validInviteEmails.length > 0 && !isMissingPlaybooks

  const handleSendInvites = () => {
    if (!canSendInvites) return

    const count = validInviteEmails.length

    if (!isDemoMode) {
      void (async () => {
        setIsSendingInvites(true)
        try {
          const response = await fetch("/api/live/manager/invites", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              emails: validInviteEmails,
              role: inviteRole,
              playbookIds: selectedPlaybooks,
            }),
          })

          if (!response.ok) {
            const payload = await response.json().catch(() => null)
            toast({
              title: "Unable to send invites",
              description: payload?.error ?? "Check your workspace session and try again.",
              variant: "destructive",
            })
            return
          }

          setIsInviteOpen(false)
          toast({
            title: "Invite emails sent",
            description: `Sent to ${count} ${count === 1 ? "person" : "people"}. They can join from the email or sign in with the same address.`,
            className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
          })
        } finally {
          setIsSendingInvites(false)
        }
      })()
      return
    }

    setIsInviteOpen(false)
    toast({
      title: "Invite emails sent",
      description: `Sent to ${count} ${count === 1 ? "person" : "people"}. They can join from the email or sign in with the same address.`,
      className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
    })
  }

  const handleResend = (email: string) => {
    const invite = activeInvites.find((item) => item.email === email)

    if (!isDemoMode && invite) {
      void (async () => {
        const response = await fetch("/api/live/manager/invites", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inviteId: invite.id }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          toast({
            title: "Unable to resend invite",
            description: payload?.error ?? "Try again.",
            variant: "destructive",
          })
          return
        }

        toast({
          title: "Invite resent",
          description: `Resent invite to ${email}.`,
          className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
        })
      })()
      return
    }

    toast({
      title: "Invite resent",
      description: `Resent invite to ${email}.`,
      className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
    })
  }

  const handleCopySignInLink = async ({
    email,
    role,
    isPendingInvite,
  }: {
    email: string
    role: "manager" | "rep"
    isPendingInvite?: boolean
  }) => {
    const link = createWorkspaceSignInLink(email, role, isPendingInvite)

    try {
      await navigator.clipboard.writeText(link)
      toast({
        title: "Sign-in link copied",
        description:
          role === "rep"
            ? "Rep can open the link, request a code, and land in the rep flow."
            : "Manager can open the link, request a code, and land in the manager flow.",
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
    } catch {
      toast({
        title: "Unable to copy link",
        description: "Clipboard access failed. Try again from a secure browser context.",
        variant: "destructive",
      })
    }
  }

  const handleDelete = () => {
    if (!deleteTarget) return

    if (!isDemoMode && deleteTarget.type === "invite") {
      void (async () => {
        const inviteId = deleteTarget.id
        const response = await fetch("/api/live/manager/invites", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inviteId }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          toast({
            title: "Unable to cancel invite",
            description: payload?.error ?? "Try again.",
            variant: "destructive",
          })
          return
        }

        setDeleteTarget(null)
        router.refresh()
        toast({
          title: "Invite canceled",
          description: "Pending invite was canceled.",
          variant: "destructive",
        })
      })()
      return
    }

    if (!isDemoMode && deleteTarget.type === "rep") {
      void (async () => {
        const memberId = deleteTarget.id
        const response = await fetch(`/api/live/manager/members/${memberId}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          toast({
            title: "Unable to remove member",
            description: payload?.error ?? "Try again.",
            variant: "destructive",
          })
          return
        }

        setDeleteTarget(null)
        router.refresh()
        toast({
          title: "Member removed",
          description: "Member was removed from the workspace.",
          variant: "destructive",
        })
      })()
      return
    }

    if (deleteTarget.type === "rep") {
      setTeam(team.filter((r) => r.id !== deleteTarget.id))
    } else {
      setInvites(invites.filter((i) => i.id !== deleteTarget.id))
    }

    setDeleteTarget(null)
    toast({
      title: deleteTarget.type === "rep" ? "Member removed" : "Invite canceled",
      description: deleteTarget.type === "rep" ? "Member was removed from workspace." : "Pending invite was canceled.",
      variant: "destructive",
    })
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-lime pulse-live" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                Reps & Access
              </span>
            </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Manage reps, manager access, and playbook assignment
          </p>
        </div>
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-xl bg-lime px-6 hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Invite Members</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] border-border/40 bg-card/95 backdrop-blur-xl rounded-3xl p-8">
              <DialogHeader className="mb-2">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime/10 border border-lime/20 shadow-inner">
                    <UserPlus className="h-6 w-6 text-lime" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-semibold tracking-tight">Invite Team Members</DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-muted-foreground">
                      Add emails, assign a role, and select which playbooks they should evaluate.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="mt-6 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invite emails</label>
                    <textarea
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                      placeholder="alex@company.com&#10;sarah@company.com"
                      className="min-h-36 w-full rounded-2xl border border-border/40 bg-surface/30 px-5 py-4 text-sm focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all outline-none resize-none shadow-sm placeholder:text-muted-foreground/50"
                    />
                    {invalidInviteEmails.length > 0 ? (
                      <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-rose-500">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="text-xs">
                          <p className="font-semibold">Invalid emails skipped</p>
                          <p className="mt-0.5 opacity-80">{invalidInviteEmails.join(", ")}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger className="w-full h-12 rounded-xl bg-surface/30 border-border/40 focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all text-sm shadow-sm">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                        <SelectItem value="Sales Rep" className="rounded-lg text-sm cursor-pointer">Sales Rep</SelectItem>
                        <SelectItem value="Manager" className="rounded-lg text-sm cursor-pointer">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className={`transition-all duration-300 ${inviteRole === "Manager" ? "opacity-50 pointer-events-none" : ""}`}>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assign playbooks</label>
                  {inviteRole === "Manager" ? (
                    <div className="rounded-2xl border border-dashed border-border/40 bg-surface/10 p-6 text-center h-[260px] flex flex-col items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-lime/10 flex items-center justify-center mb-3">
                        <Users className="w-5 h-5 text-lime" />
                      </div>
                      <p className="text-sm font-medium text-foreground/90">Full Access</p>
                      <p className="text-xs text-muted-foreground mt-1 px-4">Managers automatically have access to view, edit, and evaluate all playbooks in the workspace.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2.5 max-h-[260px] overflow-y-auto pr-2 custom-scrollbar">
                      {data.playbooks.filter(p => p.status === "published").map((playbook) => {
                        const isSelected = selectedPlaybooks.includes(playbook.id)
                      return (
                        <label
                          key={playbook.id}
                          className={`group flex items-center gap-4 rounded-xl border transition-all cursor-pointer p-3.5 shadow-sm ${
                            isSelected ? "border-lime/40 bg-lime/5" : "border-border/40 bg-surface/30 hover:bg-surface/50 hover:border-lime/30"
                          }`}
                        >
                          <div className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                            isSelected
                              ? "border-lime bg-lime text-lime-950 shadow-[0_0_10px_rgba(163,230,53,0.3)]"
                              : "border-border/80 bg-background group-hover:border-lime/50 group-hover:bg-lime/5"
                          }`}>
                            {isSelected && <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3"><path d="M3 7.5L5.5 10L11 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              setSelectedPlaybooks(prev =>
                                e.target.checked
                                  ? [...prev, playbook.id]
                                  : prev.filter(id => id !== playbook.id)
                              )
                            }}
                            className="hidden"
                          />
                          <span className={`text-sm font-medium transition-colors ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
                            {playbook.name}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  )}
                  {showPlaybookError ? (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-500">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Select at least one playbook for this Rep.</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-border/40">
                <Button variant="ghost" onClick={() => setIsInviteOpen(false)} className="rounded-xl px-6 hover:bg-surface/50 text-muted-foreground">Cancel</Button>
                <Button
                  onClick={handleSendInvites}
                  disabled={!canSendInvites}
                  className="rounded-xl bg-lime px-8 hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] disabled:opacity-50 transition-all"
                >
                  {isSendingInvites ? "Sending..." : "Send Invites"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            placeholder="Search by name or email..."
            className="pl-11 h-12 rounded-xl bg-surface/30 border-border/40 focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all text-foreground/80 outline-none backdrop-blur-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Team Table */}
      <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface/30 border-b border-border/40">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Email</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Role</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Assigned Playbooks</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Avg Score</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-foreground/80">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredTeam.length > 0 ? (
                filteredTeam.map((rep) => (
                  <tr key={rep.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-foreground/90">{rep.name}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{rep.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2.5 py-1 rounded-md bg-surface border border-border/50 text-xs font-medium text-foreground/80">{rep.role}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <div className="flex flex-wrap gap-1.5">
                        {rep.playbooks.slice(0, 2).map((pb, i) => (
                          <span key={i} title={pb} className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface border border-border/50 text-[11px] font-medium text-foreground/80 truncate max-w-[160px]">
                            {pb}
                          </span>
                        ))}
                        {rep.playbooks.length > 2 && (
                          <span title={rep.playbooks.slice(2).join(", ")} className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface/50 border border-border/30 text-[11px] font-medium text-muted-foreground">
                            +{rep.playbooks.length - 2} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 text-[10px] uppercase tracking-wider font-mono rounded-md border ${rep.status === "active" ? "bg-lime/10 border-lime/20 text-lime" : "bg-gray-500/10 border-gray-500/20 text-gray-400"}`}>
                        {rep.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {rep.status.toLowerCase() === "active" ? (
                        <span className="text-sm font-mono bg-lime/10 text-lime px-3 py-1.5 rounded-md">{rep.avgScore}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() =>
                            handleCopySignInLink({
                              email: rep.email,
                              role: rep.role === "Manager" ? "manager" : "rep",
                            })
                          }
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all hover:bg-surface/50"
                        >
                          <Link2 className="mr-2 h-3.5 w-3.5" />
                          Copy link
                        </Button>
                        {rep.email === viewer?.email ? (
                          <span className="rounded-md border border-border/50 bg-surface px-2.5 py-1 text-xs font-medium text-foreground/80">
                            You
                          </span>
                        ) : (
                          <Button onClick={() => setDeleteTarget({ id: rep.id, type: "rep" })} variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto p-8 rounded-2xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
                      <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                        <Users className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-base font-semibold text-foreground/90">Your workspace is lonely</p>
                      <p className="text-sm text-muted-foreground mt-2 mb-6">Invite reps to join your team, assign them playbooks, and track their performance.</p>
                      <Button onClick={() => setIsInviteOpen(true)} className="gap-2 rounded-xl bg-lime hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all">
                        <Plus className="w-4 h-4" />
                        Invite your first rep
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-lg font-semibold text-foreground/90">Pending invites</h2>
          <div className="mt-5 space-y-3">
            {activeInvites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/40 bg-surface/30 p-8 transition-colors flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-surface/50 border border-border/40 flex items-center justify-center mb-3 shadow-inner">
                  <Mail className="w-5 h-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-semibold text-foreground/90">No pending invites</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">Sent invitations will appear here until they are accepted.</p>
              </div>
            ) : (
              activeInvites.map((invite) => (
                <div key={invite.id} className="flex flex-col gap-3 rounded-xl border border-border/40 bg-surface/30 p-4 hover:bg-surface/50 transition-colors md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground/90">{invite.email}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <span>{invite.role}</span>
                      <span className="text-border/40">•</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {invite.playbooks.slice(0, 2).map((pb, i) => (
                          <span key={i} title={pb} className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface/50 border border-border/30 text-[9px] font-medium text-foreground/70 truncate max-w-[120px] normal-case">
                            {pb}
                          </span>
                        ))}
                        {invite.playbooks.length > 2 && (
                          <span title={invite.playbooks.slice(2).join(", ")} className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface/30 border border-border/20 text-[9px] font-medium text-muted-foreground normal-case">
                            +{invite.playbooks.length - 2}
                          </span>
                        )}
                      </div>
                      <span className="text-border/40">•</span>
                      <span>Sent {invite.sentAt}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 text-[10px] uppercase tracking-wider font-mono rounded-md border bg-gray-500/10 border-gray-500/20 text-gray-400">{invite.status}</span>
                    <Button
                      onClick={() =>
                        handleCopySignInLink({
                          email: invite.email,
                          role: invite.role === "Manager" ? "manager" : "rep",
                          isPendingInvite: true,
                        })
                      }
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all hover:bg-surface/50"
                    >
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copy link
                    </Button>
                    <Button onClick={() => handleResend(invite.email)} variant="outline" size="sm" className="rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all hover:bg-surface/50">Resend</Button>
                    <Button onClick={() => setDeleteTarget({ id: invite.id, type: "invite" })} variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl border-border/40 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "rep"
                ? "This will remove the member from your workspace. They will lose access to all playbooks and calls."
                : "This will cancel the pending invite. The link they received will no longer work."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl hover:bg-surface/50">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteTarget?.type === "rep" ? "Remove member" : "Cancel invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function TeamPageClient({ initialData }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const { isDemoMode } = useDemo()
  const { data } = useDemoLiveResource({
    demoData: getDemoManagerWorkspaceData(),
    liveUrl: "/api/live/manager",
    emptyData: initialData,
  })
  return (
    <DashboardLayout>
      <TeamPageInner initialData={data} isDemoMode={isDemoMode} />
    </DashboardLayout>
  )
}

export default function TeamPage() {
  return (
    <DashboardLayout>
      <TeamPageInner initialData={{ viewer: null, calls: [], playbooks: [], reps: [], invites: [] }} isDemoMode={true} />
    </DashboardLayout>
  )
}
