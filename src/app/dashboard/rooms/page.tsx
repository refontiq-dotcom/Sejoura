"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function RoomsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/residences");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
    </div>
  );
}