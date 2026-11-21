import type { CSSProperties } from "react";

/*
 * A small burst of confetti around the check mark at "Klaar, dank je wel!"
 * (SPEC §6.5: confetti only here, at the winner and at the medal table).
 * Transform and opacity only, once, and nothing at all with reduced motion.
 */

const KLEUREN = ["#F5AE1B", "#F06A1F", "#B4441A", "#A7B43A", "#4FA3A5", "#FCEBD0"];
const AANTAL = 22;

/** Fixed positions, so the server and the phone draw the same thing. */
const STUKJES = Array.from({ length: AANTAL }, (_, i) => {
  const hoek = (i / AANTAL) * Math.PI * 2 + (i % 3) * 0.21;
  const afstand = 70 + ((i * 37) % 55);
  return {
    x: Math.round(Math.cos(hoek) * afstand),
    y: Math.round(Math.sin(hoek) * afstand * 0.8 - 30),
    draai: ((i * 83) % 300) - 150,
    kleur: KLEUREN[i % KLEUREN.length],
    breed: i % 4 === 0 ? 8 : 6,
    hoog: i % 4 === 0 ? 8 : 12,
    rond: i % 4 === 0,
    wacht: (i % 5) * 40,
  };
});

const KEYFRAMES = `
@keyframes ff-confetti {
  0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
  10% { opacity: 1; }
  55% { transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(var(--r)) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y) + 90px)) rotate(calc(var(--r) * 2)) scale(1); opacity: 0; }
}`;

export function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 motion-reduce:hidden">
      <style>{KEYFRAMES}</style>
      {STUKJES.map((stukje, i) => (
        <span
          key={i}
          className="absolute top-0 left-0 block opacity-0"
          style={
            {
              width: stukje.breed,
              height: stukje.hoog,
              background: stukje.kleur,
              borderRadius: stukje.rond ? 999 : 2,
              "--x": `${stukje.x}px`,
              "--y": `${stukje.y}px`,
              "--r": `${stukje.draai}deg`,
              animation: `ff-confetti 1500ms cubic-bezier(0.16, 1, 0.3, 1) ${stukje.wacht}ms both`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
