// Decorations drawn in the template's accent colour: a kbach-style scroll, a lotus, the towers
// of Angkor, a spray of romdoul flowers, a naga, sugar palms, stars, wedding rings or champa. Inline SVG, so they stay sharp on any screen
// and need no download.
export type OrnamentName = "kbach" | "lotus" | "angkor" | "romdoul" | "naga" | "palm" | "stars" | "rings" | "champa";

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

function Palm() {
  // Sugar palms (thnot), the tree of the Cambodian countryside, over a line of rice field.
  const palm = (x: number, h: number, opacity: number) => (
    <g key={x} fillOpacity={opacity} strokeOpacity={opacity}>
      <path d={`M${x} 50 C${x + 1} ${50 - h * 0.5} ${x - 1} ${50 - h * 0.8} ${x} ${50 - h}`} fill="none" strokeWidth="1.8" />
      {[-70, -40, -12, 12, 40, 70].map((a) => (
        <ellipse key={a} cx={x} cy={50 - h - 7} rx="2.6" ry="8" transform={`rotate(${a} ${x} ${50 - h})`} stroke="none" />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 200 56" className="h-12 w-full max-w-[12rem]" fill="currentColor" stroke="currentColor" strokeLinecap="round" aria-hidden>
      {palm(70, 26, 0.6)}
      {palm(100, 34, 1)}
      {palm(132, 22, 0.5)}
      <path d="M20 51 H180" strokeWidth="1.4" fill="none" />
      <path d="M40 55 H160" strokeWidth="1" strokeOpacity=".5" fill="none" />
    </svg>
  );
}

function Stars() {
  // Twinkling stars and a crescent moon, for evening receptions.
  const star = (x: number, y: number, r: number, opacity = 1) => (
    <path
      key={`${x}-${y}`}
      d={`M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`}
      fillOpacity={opacity}
    />
  );
  return (
    <svg viewBox="0 0 200 52" className="h-11 w-full max-w-[12rem]" fill="currentColor" aria-hidden>
      <path d="M100 8 a16 16 0 1 0 14 24 a13 13 0 1 1 -14 -24 Z" />
      {star(62, 22, 7)}
      {star(138, 22, 7)}
      {star(40, 36, 4, 0.7)}
      {star(160, 36, 4, 0.7)}
      {star(80, 40, 3, 0.55)}
      {star(120, 42, 3, 0.55)}
      {star(24, 18, 2.5, 0.45)}
      {star(176, 16, 2.5, 0.45)}
    </svg>
  );
}

function Rings() {
  // Two interlocked wedding rings with a small diamond, between two fine lines.
  return (
    <svg viewBox="0 0 200 52" className="h-11 w-full max-w-[12rem]" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <path d="M20 30 H72 M128 30 H180" strokeWidth="1.2" strokeOpacity=".6" />
      <circle cx="91" cy="31" r="13" strokeWidth="2.6" />
      <circle cx="109" cy="31" r="13" strokeWidth="2.6" strokeOpacity=".75" />
      <path d="M86 14 L91 8 L96 14 L91 19 Z" fill="currentColor" strokeWidth="1" />
      <circle cx="20" cy="30" r="1.6" fill="currentColor" />
      <circle cx="180" cy="30" r="1.6" fill="currentColor" />
    </svg>
  );
}

function Champa() {
  // Champa (frangipani) blossoms: five rounded petals, each overlapping the next.
  const flower = (x: number, y: number, r: number, turn: number, opacity = 1) => (
    <g key={`${x}`} transform={`translate(${x} ${y}) rotate(${turn})`} fillOpacity={opacity}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={r * 0.55} cy={-r * 0.35} rx={r * 0.62} ry={r * 0.34} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.22} fill="var(--inv-bg)" fillOpacity=".7" />
    </g>
  );
  return (
    <svg viewBox="0 0 200 52" className="h-11 w-full max-w-[12rem]" fill="currentColor" aria-hidden>
      <path d="M40 40 C70 30 130 30 160 40" fill="none" stroke="currentColor" strokeWidth="1.3" strokeOpacity=".5" strokeLinecap="round" />
      {flower(100, 24, 15, 0)}
      {flower(68, 32, 10, 20, 0.7)}
      {flower(132, 32, 10, -20, 0.7)}
      {flower(42, 38, 6, 40, 0.45)}
      {flower(158, 38, 6, -40, 0.45)}
    </svg>
  );
}

export function Ornament({ name, flip = false }: { name: OrnamentName | undefined; flip?: boolean }) {
  if (!name) return null;
  return (
    <div className={`flex justify-center text-[var(--inv-accent)] ${flip ? "rotate-180" : ""}`} data-testid={`ornament-${name}`}>
      {name === "kbach" ? <Kbach /> : name === "lotus" ? <Lotus /> : name === "romdoul" ? <Romdoul /> : name === "naga" ? <Naga /> : name === "palm" ? <Palm /> : name === "stars" ? <Stars /> : name === "rings" ? <Rings /> : name === "champa" ? <Champa /> : <Angkor />}
    </div>
  );
}
