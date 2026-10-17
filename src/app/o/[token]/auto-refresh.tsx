"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While the order waits for payment, check again every 10 seconds so the tickets appear by themselves. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
