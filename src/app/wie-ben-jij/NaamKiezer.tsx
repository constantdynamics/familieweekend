"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { IconVinkje } from "@/components/ui/icons";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { kiesNaam, klaar, laatNaamLos, type NaamState } from "./actions";

type Naam = { id: string; naam: string; roepnaam: string | null; status: "vrij" | "bezet" | "van-jou" };

function zoekVorm(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function NaamKiezer({ namen, terug }: { namen: Naam[]; terug: string }) {
  const [state, action, pending] = useActionState<NaamState, FormData>(kiesNaam, {});
  const [zoek, setZoek] = useState("");
  const mijn = namen.filter((n) => n.status === "van-jou");
  const gefilterd = useMemo(() => {
    const term = zoekVorm(zoek.trim());
    return namen.filter((n) => n.status !== "van-jou" && (!term || zoekVorm(`${n.naam} ${n.roepnaam ?? ""}`).includes(term)));
  }, [namen, zoek]);

  if (namen.length === 0) {
    return (
      <Kaart className="mt-6 flex flex-col gap-3">
        <h2 className="m-0 text-[20px] font-extrabold">De lijst is er nog niet</h2>
        <p className="m-0 text-[15px] leading-[1.45]">
          De organisatie zet de namen er binnenkort in. Kijk dan nog een keer, rondkijken kan nu al.
        </p>
        <Link href={terug} className="text-[16px] font-bold text-studio underline underline-offset-4">
          Verder naar de app
        </Link>
      </Kaart>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {mijn.length > 0 ? (
        <Kaart className="flex flex-col gap-3" aria-labelledby="mijn-namen">
          <h2 id="mijn-namen" className="m-0 text-[20px] font-extrabold">
            {mijn.length === 1 ? "Op deze telefoon ben je" : "Op deze telefoon zijn"}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {mijn.map((n) => (
              <li key={n.id} className="flex items-center gap-3 rounded-tegel bg-papier px-3.5 py-2">
                <IconVinkje size={20} className="flex-none text-avocado" />
                <span className="flex-1 text-[17px] font-bold">{n.roepnaam ?? n.naam}</span>
                <form action={laatNaamLos}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="min-h-11 px-2 text-label font-bold text-studio underline underline-offset-4">
                    Niet van mij
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[15px] leading-[1.45]">
            Vul je ook in voor iemand anders, bijvoorbeeld een kind? Kies hieronder nog een naam.
          </p>
          <form action={klaar}>
            <input type="hidden" name="terug" value={terug} />
            <Knop type="submit" size="groot" className="w-full">
              Klaar, naar de app
            </Knop>
          </form>
        </Kaart>
      ) : null}

      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gekozen ? <Melding tone="goed">Gelukt! Deze telefoon hoort nu bij {state.gekozen}.</Melding> : null}

      <div className="op-licht rounded-kaart bg-beeldbuis p-[18px] text-studio shadow-kaart">
        <Veld
          label={mijn.length > 0 ? "Zoek nog een naam" : "Zoek je naam"}
          name="zoek"
          type="search"
          value={zoek}
          onChange={(event) => setZoek(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0" aria-live="polite">
          {gefilterd.map((n) => (
            <li key={n.id}>
              <form action={action}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="naam" value={n.roepnaam ?? n.naam} />
                <button
                  type="submit"
                  disabled={pending || n.status === "bezet"}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-tegel border-[3px] border-studio bg-papier px-3.5 text-left text-[17px] font-bold text-studio active:translate-y-px disabled:border-papier-streep disabled:text-[#8a6a55]"
                >
                  <span>
                    {n.naam}
                    {n.roepnaam ? <span className="font-medium"> ({n.roepnaam})</span> : null}
                  </span>
                  {n.status === "bezet" ? <span className="text-label font-medium">al gekozen</span> : null}
                </button>
              </form>
            </li>
          ))}
          {gefilterd.length === 0 ? (
            <li className="text-[15px] leading-[1.45]">Geen naam gevonden. Staat je naam er niet in? Vraag het de organisatie.</li>
          ) : null}
        </ul>
      </div>

      {mijn.length === 0 ? (
        <Link href={terug} className="self-start text-[15px] text-zand underline underline-offset-4">
          Ik kijk eerst even rond
        </Link>
      ) : null}
    </div>
  );
}
