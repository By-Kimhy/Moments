"use client";

import { useEffect } from "react";

/** Tells the API the guest opened their invitation. Runs only in a real browser, not link-preview bots. */
export function OpenTracker({ token }: { token: string }) {
  useEffect(() => {
    fetch(`/api/invitations/${token}/open`, { method: "POST" }).catch(() => {});
  }, [token]);
  return null;
}
