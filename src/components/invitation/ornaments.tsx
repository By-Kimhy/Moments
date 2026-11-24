// Decorations drawn in the template's accent colour: a kbach-style scroll, a lotus, the towers
// of Angkor, a spray of romdoul flowers or a naga. Inline SVG, so they stay sharp on any screen
// and need no download.
export type OrnamentName = "kbach" | "lotus" | "angkor" | "romdoul" | "naga";

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

function Romdoul() {
  // Cambodia's national flower: small three-petalled blossoms on a curved stem with leaves.
  const blossom = (x: number, y: number, r: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
      {[0, 120, 240].map((a) => (
        <ellipse key={a} cx="0" cy={-r} rx={r * 0.62} ry={r} transform={`rotate(${a})`} fillOpacity=".85" />
      ))}
      <circle r={r * 0.35} fill="var(--inv-bg)" />
    </g>
  );
  return (
    <svg viewBox="0 0 200 52" className="h-11 w-full max-w-[12rem]" fill="currentColor" aria-hidden>
      <path d="M20 40C60 20 140 20 180 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {[
        [48, 29, -30],
        [152, 29, 30],
        [78, 25, -15],
        [122, 25, 15],
      ].map(([x, y, a]) => (
        <ellipse key={`${x}`} cx={x} cy={y + 8} rx="9" ry="3.5" transform={`rotate(${a} ${x} ${y + 8})`} fillOpacity=".45" />
      ))}
      {blossom(100, 16, 7)}
      {blossom(64, 24, 5.5)}
      {blossom(136, 24, 5.5)}
      {blossom(34, 34, 4.2)}
      {blossom(166, 34, 4.2)}
    </svg>
  );
}

function Naga() {
  // A seven-headed naga, its hood fanned out above a wave-shaped body that runs to both sides,
  // as on the balustrades of Angkor.
  const heads = [-54, -36, -18, 0, 18, 36, 54];
  return (
    <svg viewBox="0 0 220 60" className="h-12 w-full max-w-[13rem]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* The hood: each head a pointed leaf on a ring around the neck. */}
      {heads.map((angle) => (
        <path
          key={angle}
          d="M110 44 C104 34 105 22 110 14 C115 22 116 34 110 44 Z"
          transform={`rotate(${angle} 110 46)`}
          fill="currentColor"
          fillOpacity={angle === 0 ? 0.9 : 0.55}
        />
      ))}
      <path d="M92 46 Q110 38 128 46" strokeWidth="2" />
      {/* The body, waving out to each side. */}
      <path d="M92 48 C80 54 72 42 60 48 S40 54 28 48 S12 44 6 50" />
      <path d="M128 48 C140 54 148 42 160 48 S180 54 192 48 S208 44 214 50" />
      <circle cx="6" cy="50" r="1.8" fill="currentColor" />
      <circle cx="214" cy="50" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function Ornament({ name, flip = false }: { name: OrnamentName | undefined; flip?: boolean }) {
  if (!name) return null;
  return (
    <div className={`flex justify-center text-[var(--inv-accent)] ${flip ? "rotate-180" : ""}`} data-testid={`ornament-${name}`}>
      {name === "kbach" ? <Kbach /> : name === "lotus" ? <Lotus /> : name === "romdoul" ? <Romdoul /> : name === "naga" ? <Naga /> : <Angkor />}
    </div>
  );
}
