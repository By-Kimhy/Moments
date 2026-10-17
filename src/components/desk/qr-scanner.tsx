"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

/**
 * Reads QR codes from the back camera. Uses jsQR on video frames, which works on Android and
 * iPhone browsers alike (BarcodeDetector is missing on iOS). Needs https (or localhost).
 */
export function QrScanner({ onResult, hint, errorText }: { onResult: (text: string) => void; hint: string; errorText: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Shown only after a tap, so this runs in the browser.
  const [failed, setFailed] = useState(() => !navigator.mediaDevices);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let last = "";
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && context && video.readyState >= video.HAVE_ENOUGH_DATA) {
        // A smaller frame is plenty for a QR held close, and much faster on older phones.
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code?.data && code.data !== last) {
          last = code.data;
          onResultRef.current(code.data);
          // Let the same code be read again after a pause.
          setTimeout(() => (last = ""), 2500);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current!;
        video.srcObject = s;
        return video.play().then(() => {
          frame = requestAnimationFrame(tick);
        });
      })
      .catch(() => setFailed(true));

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (failed) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
        <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
      </div>
      <p className="text-center text-sm text-muted">{hint}</p>
    </div>
  );
}
