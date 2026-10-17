"use client";

import { useEffect, useRef } from "react";

// The Telegram Login Widget. After the person confirms in Telegram, it sends them to
// /auth/telegram with signed query parameters, which the API verifies.
export function TelegramButton({ bot }: { bot: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.dataset.telegramLogin = bot;
    script.dataset.size = "large";
    script.dataset.radius = "8";
    script.dataset.authUrl = `${window.location.origin}/auth/telegram`;
    script.dataset.requestAccess = "write";
    container.appendChild(script);
    return () => {
      container.innerHTML = "";
    };
  }, [bot]);

  return <div ref={ref} className="flex justify-center" />;
}
