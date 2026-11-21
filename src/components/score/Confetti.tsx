const KLEUREN = ["#F06A1F", "#F5AE1B", "#FCEBD0", "#A7B43A", "#4FA3A5", "#B4441A"];

type Snipper = { links: string; breed: number; hoog: number; kleur: string; duur: string; wacht: string };

/** The same pieces every time (a fixed seed), so a screenshot or a replay looks alike. */
function snippers(aantal: number, zaad: number): Snipper[] {
  let s = zaad;
  const random = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: aantal }, (_, index) => ({
    links: `${Math.round(random() * 98)}%`,
    breed: 6 + Math.round(random() * 6),
    hoog: 10 + Math.round(random() * 10),
    kleur: KLEUREN[index % KLEUREN.length],
    duur: `${(2.6 + random() * 2.4).toFixed(2)}s`,
    wacht: `${(random() * 2.2).toFixed(2)}s`,
  }));
}

const CSS = `
@keyframes valk-valt {
  0% { transform: translate3d(0, -40px, 0) rotate(0deg); }
  100% { transform: translate3d(0, 110vh, 0) rotate(600deg); }
}
.valk-snipper { animation: valk-valt linear 3 backwards; will-change: transform; }
@media (prefers-reduced-motion: reduce) { .valk-confetti { display: none; } }
`;

/**
 * Confetti for the winner and the medal table (SPEC §6.5): only transforms,
 * no filters, three showers and then it stops. Not shown with reduced motion.
 */
export function Confetti({ aantal = 44, zaad = 7 }: { aantal?: number; zaad?: number }) {
  const lijst = snippers(aantal, zaad);
  return (
    <>
      <style href="valk-confetti" precedence="default">
        {CSS}
      </style>
      <div aria-hidden="true" className="valk-confetti pointer-events-none fixed inset-0 z-20 overflow-hidden">
        {lijst.map((snipper, index) => (
          <span
            key={index}
            className="valk-snipper absolute top-0 block rounded-[2px]"
            style={{
              left: snipper.links,
              width: snipper.breed,
              height: snipper.hoog,
              background: snipper.kleur,
              animationDuration: snipper.duur,
              animationDelay: snipper.wacht,
            }}
          />
        ))}
      </div>
    </>
  );
}
