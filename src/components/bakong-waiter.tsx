"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { clientApi } from "@/lib/client-api";

const CHECK_MS = 5_000;

/** While a payment page is open, asks Bakong every few seconds and reloads once it is paid. */
export function BakongWaiter({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    let done = false;
    const timer = setInterval(async () => {
      try {
        const { paid } = await clientApi<{ paid: boolean }>(`/platform/orders/${orderId}/check`, { method: "POST" });
        if (paid && !done) {
          done = true;
          router.refresh();
        }
      } catch {
        // Try again on the next tick.
      }
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, [orderId, router]);
  return <p className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900" data-testid="bakong-waiting">{label}</p>;
}
