"use client";

import { Sidebar } from "@/components/flights/Sidebar";

export default function FlightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative h-full">
        {children}
      </main>
    </div>
  );
}
