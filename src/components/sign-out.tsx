"use client";

import { useRef } from "react";
import { clearSavedPages } from "@/components/pwa";
import { allPendingCount, clearDeskData } from "@/lib/offline/outbox";

/**
 * Signing out (hosts) or leaving the desk (helpers) also wipes the guest list and saved pages
 * kept on this phone, since phones at a wedding get passed around. Unsent gifts or check-ins
 * would be lost, so it asks first.
 */
export function SignOutButton({ action, label, unsentWarning }: { action: () => Promise<void>; label: string; unsentWarning: string }) {
  const cleared = useRef(false);
  return (
    <form
      action={action}
      onSubmit={async (e) => {
        if (cleared.current) return; // second pass: let the action run
        const form = e.currentTarget;
        e.preventDefault();
        try {
          if ((await allPendingCount()) > 0 && !window.confirm(unsentWarning)) return;
          await clearDeskData();
        } catch {
          // No IndexedDB (private mode): nothing stored to clear.
        }
        clearSavedPages();
        cleared.current = true;
        form.requestSubmit();
      }}
    >
      <button className="text-sm text-muted underline">{label}</button>
    </form>
  );
}
