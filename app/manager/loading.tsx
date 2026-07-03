import { DashboardLayout } from "@/components/dashboard/dashboard-layout"

export default function ManagerLoading() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 lg:p-8 space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-muted/40" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted/30" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-muted/30" />
      </div>
    </DashboardLayout>
  )
}
