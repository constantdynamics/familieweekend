"use client";

/**
 * Steen, papier, schaar (SPEC §4.7) on the phones of the family. The quiz
 * screen shows this while the live mode is "intermezzo".
 * Placeholder: built separately (docs/PLAN-fase-2-4.md, onderdeel 11).
 */
export function Intermezzo() {
  return (
    <section aria-live="polite" className="rounded-kaart bg-studio-licht p-5 text-center">
      <h2 className="m-0 font-display text-[28px] font-normal schaduw-oranje">Intermezzo</h2>
      <p className="m-0 mt-2 text-[16px] text-zand">Steen, papier, schaar! Even geduld, het begint zo.</p>
    </section>
  );
}
