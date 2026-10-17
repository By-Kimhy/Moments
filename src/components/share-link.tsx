"use client";

import { useState } from "react";

/** Copy-to-clipboard and Telegram share buttons for a guest's invitation link. */
export function ShareLink({ url, text, labels }: { url: string; text: string; labels: { copy: string; copied: string; telegram: string } }) {
  const [copied, setCopied] = useState(false);
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  return (
    <span className="flex gap-3 text-sm">
      <button
        type="button"
        className="underline"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? labels.copied : labels.copy}
      </button>
      <a href={telegram} target="_blank" rel="noreferrer" className="text-sky-700 underline">
        {labels.telegram}
      </a>
    </span>
  );
}
