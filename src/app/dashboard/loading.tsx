import { Skeleton } from "@/components/ui/skeletons";

// État de chargement immédiat affiché par Next.js pendant la navigation entre
// les modules du dashboard. Il garde la sidebar et l'en-tête visibles et évite
// le "tout disparaît puis recharge" lors du changement de module.
export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="w-44 h-6" />
          <Skeleton className="w-60 h-4" />
        </div>
        <Skeleton className="w-32 h-10 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm space-y-3"
          >
            <Skeleton className="w-12 h-12 rounded-xl" />
            <Skeleton className="w-32 h-4" />
            <Skeleton className="w-24 h-7" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-full h-4" />
                <Skeleton className="w-2/3 h-4" />
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-3 p-5 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm flex flex-col items-center justify-center">
          <Skeleton className="w-44 h-44 rounded-full" />
        </div>
      </div>
    </div>
  );
}
