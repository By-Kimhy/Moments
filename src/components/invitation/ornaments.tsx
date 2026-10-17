// Decorations drawn in the template's accent colour: a kbach-style scroll, a lotus, or the towers
// of Angkor. Inline SVG, so they stay sharp on any screen and need no download.
export type OrnamentName = "kbach" | "lotus" | "angkor";

function Kbach() {
  return (
    <svg viewBox="0 0 240 48" className="h-10 w-full max-w-xs" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M120 6c-6 8-6 16 0 24 6-8 6-16 0-24Z" fill="currentColor" fillOpacity=".25" />
      <path d="M120 30c-4 6-4 10 0 14 4-4 4-8 0-14Z" fill="currentColor" />
      {[1, -1].map((dir) => (
        <g key={dir} transform={dir === -1 ? "translate(240 0) scale(-1 1)" : undefined}>
          <path d="M112 24c-10-14-26-14-34-4-6 8 0 18 8 16 7-2 7-11 1-12" />
          <path d="M78 22c-10-8-24-6-30 2-5 7 1 15 8 13 5-2 5-8 1-9" />
          <path d="M48 26c-12-2-24 2-32 10" />
          <path d="M100 30c-4 6-12 10-22 10" />
          <circle cx="12" cy="38" r="2.4" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

function Lotus() {
  return (
    <svg viewBox="0 0 120 56" className="h-12 w-full max-w-[9rem]" fill="currentColor" aria-hidden>
      <path d="M60 4c-9 12-9 26 0 38 9-12 9-26 0-38Z" fillOpacity=".9" />
      <path d="M60 42C48 36 38 24 36 10c12 4 22 14 24 32Z" fillOpacity=".6" />
      <path d="M60 42c12-6 22-18 24-32-12 4-22 14-24 32Z" fillOpacity=".6" />
      <path d="M60 44C44 44 28 36 18 22c16-2 32 6 42 22Z" fillOpacity=".35" />
      <path d="M60 44c16 0 32-8 42-22-16-2-32 6-42 22Z" fillOpacity=".35" />
      <path d="M20 50h80" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Angkor() {
  // Five towers, the middle one tallest, on a terrace.
  const tower = (x: number, h: number, w: number) =>
    `M${x - w} 50 L${x - w} ${50 - h * 0.45} Q${x - w * 0.9} ${50 - h * 0.75} ${x} ${50 - h} Q${x + w * 0.9} ${50 - h * 0.75} ${x + w} ${50 - h * 0.45} L${x + w} 50 Z`;
  return (
    <svg viewBox="0 0 200 56" className="h-12 w-full max-w-[12rem]" fill="currentColor" aria-hidden>
      <path d={tower(30, 26, 9)} fillOpacity=".55" />
      <path d={tower(170, 26, 9)} fillOpacity=".55" />
      <path d={tower(62, 36, 11)} fillOpacity=".75" />
      <path d={tower(138, 36, 11)} fillOpacity=".75" />
      <path d={tower(100, 48, 14)} />
      <rect x="10" y="50" width="180" height="4" rx="1" />
    </svg>
  );
}

export function Ornament({ name, flip = false }: { name: OrnamentName | undefined; flip?: boolean }) {
  if (!name) return null;
  return (
    <div className={`flex justify-center text-[var(--inv-accent)] ${flip ? "rotate-180" : ""}`} data-testid={`ornament-${name}`}>
      {name === "kbach" ? <Kbach /> : name === "lotus" ? <Lotus /> : <Angkor />}
    </div>
  );
}
