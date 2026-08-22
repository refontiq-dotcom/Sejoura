import React from "react";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-700/50 ${className}`}
      {...props}
    />
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export function KPICardSkeleton() {
  return (
    <div className="p-5 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <Skeleton className="w-16 h-6 rounded-full" />
      </div>
      <Skeleton className="w-32 h-4 mb-2" />
      <Skeleton className="w-24 h-8" />
    </div>
  );
}

export function DashboardSkeletons() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm h-96">
          <Skeleton className="w-48 h-6 mb-6" />
          <div className="space-y-3">
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
        </div>
        <div className="lg:col-span-3 p-5 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm h-96 flex flex-col items-center justify-center">
          <Skeleton className="w-48 h-48 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Bookings ───────────────────────────────────────────────────────────────

export function BookingsSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Skeleton className="w-32 h-10 rounded-lg" />
        <Skeleton className="w-24 h-10 rounded-lg" />
        <Skeleton className="w-28 h-10 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="w-40 h-10 rounded-lg" />
      </div>
      {/* Table */}
      <div className="rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border,var(--border))]">
          <div className="grid grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-4 rounded" />
            ))}
          </div>
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="p-4 border-b border-[var(--card-border,var(--border))] last:border-0">
            <div className="grid grid-cols-6 gap-4 items-center">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Rooms ──────────────────────────────────────────────────────────────────

export function RoomsSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-wrap gap-3 mb-6">
        <Skeleton className="w-36 h-10 rounded-lg" />
        <Skeleton className="w-28 h-10 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="w-32 h-10 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="p-4 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="w-16 h-6 rounded" />
              <Skeleton className="w-20 h-5 rounded-full" />
            </div>
            <Skeleton className="w-24 h-4" />
            <div className="flex gap-2">
              <Skeleton className="w-12 h-5 rounded-full" />
              <Skeleton className="w-12 h-5 rounded-full" />
            </div>
            <Skeleton className="w-full h-8 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Employees ──────────────────────────────────────────────────────────────

export function EmployeesSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-wrap gap-3 mb-6">
        <Skeleton className="w-32 h-10 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="w-40 h-10 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="p-5 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="w-32 h-4" />
                <Skeleton className="w-20 h-3" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="w-16 h-5 rounded-full" />
              <Skeleton className="w-16 h-5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cleaning ───────────────────────────────────────────────────────────────

export function CleaningSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-wrap gap-3 mb-6">
        <Skeleton className="w-28 h-10 rounded-lg" />
        <Skeleton className="w-24 h-10 rounded-lg" />
        <Skeleton className="w-32 h-10 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="w-36 h-10 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="p-4 rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="w-20 h-5 rounded" />
              <Skeleton className="w-16 h-5 rounded-full" />
            </div>
            <Skeleton className="w-32 h-4" />
            <Skeleton className="w-24 h-3" />
            <Skeleton className="w-full h-8 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Generic Table ──────────────────────────────────────────────────────────

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] shadow-sm overflow-hidden animate-in fade-in duration-300">
      <div className="p-4 border-b border-[var(--card-border,var(--border))]">
        <div className={`grid grid-cols-${cols} gap-4`}>
          {[...Array(cols)].map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
      </div>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="p-4 border-b border-[var(--card-border,var(--border))] last:border-0">
          <div className={`grid grid-cols-${cols} gap-4 items-center`}>
            {[...Array(cols)].map((_, j) => (
              <Skeleton key={j} className="h-4 w-20" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
