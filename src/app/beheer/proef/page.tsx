import type { Metadata } from "next";
import { Suspense } from "react";
import { Keuzelijst } from "@/components/ui/Invoer";
import { Kaart } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { getRequestContext } from "@/lib/server/context";
import { listParticipants } from "@/lib/server/participants";
import { testEnvironmentSummary } from "@/lib/server/proef";
import { requireAdmin } from "@/lib/server/session";
import { listTeams } from "@/lib/server/teams";
import { BeheerKop, BeheerLaden, ProefMelding } from "../onderdelen";
import { bekijkAls, gaDeProefIn, stopBekijken, verlaatDeProef } from "./actions";
import { ProefKlaarzetten, ProefLeegmaken, Uitnodiging } from "./onderdelen";

export const metadata: Metadata = { title: "Proefmodus" };

export default function ProefPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

const ROL_LABEL = { familie: "familielid", captain: "captain", meekijker: "meekijker", spelleider: "spelleider" } as const;

async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  const samenvatting = await testEnvironmentSummary();
  const bestaat = samenvatting.teams > 0;
  const [teams, namen] = await Promise.all([listTeams("test"), listParticipants("test")]);

  return (
    <>
      <BeheerKop
        titel="Proefmodus"
        sub="Probeer alles uit met proefteams en testnamen. De echte Spelen raak je hier niet."
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}

      <div className="mt-5 flex flex-col gap-4">
        <Kaart className="flex flex-col gap-3">
          <h2 className="m-0 text-[20px] font-extrabold">{ctx.env === "test" ? "Je zit in de proef" : "Je zit in het echte weekend"}</h2>
          <p className="m-0 text-[15px] leading-[1.45]">
            {ctx.env === "test"
              ? "Quiz, zeskamp, scorebord en prijsuitreiking op deze telefoon gebruiken nu de proefteams. Na een dag stopt de proef vanzelf."
              : bestaat
                ? `In de proef staan ${samenvatting.teams} teams, ${samenvatting.names} testnamen en ${samenvatting.events} onderdelen.`
                : "Er staat nog geen proef klaar. Zet hem hieronder klaar, en ga daarna de proef in."}
          </p>
          <form action={ctx.env === "test" ? verlaatDeProef : gaDeProefIn}>
            <Knop type="submit">{ctx.env === "test" ? "Verlaat de proef" : "Ga de proef in op deze telefoon"}</Knop>
          </form>
        </Kaart>

        <ProefKlaarzetten bestaat={bestaat} />

        {bestaat ? <Uitnodiging /> : null}

        {ctx.env === "test" && bestaat ? (
          <Kaart className="flex flex-col gap-3">
            <h2 className="m-0 text-[20px] font-extrabold">Bekijk als…</h2>
            <p className="m-0 text-[15px] leading-[1.45]">
              Zie de app zoals een familielid, captain, meekijker of spelleider hem ziet. Als captain kun je ook echt
              antwoorden, maar alleen in de proef.
            </p>
            {ctx.viewAs ? (
              <form action={stopBekijken} className="flex flex-col gap-2">
                <p className="m-0 text-[15px] font-bold">Je bekijkt de app nu als {ROL_LABEL[ctx.viewAs.role]}.</p>
                <Knop type="submit" variant="secundair-licht" size="klein" className="self-start">
                  Stop met bekijken
                </Knop>
              </form>
            ) : null}
            <form action={bekijkAls} className="flex flex-col gap-3">
              <Keuzelijst label="Als" name="rol" defaultValue="captain">
                <option value="familie">Familielid</option>
                <option value="captain">Captain</option>
                <option value="meekijker">Meekijker</option>
                <option value="spelleider">Spelleider</option>
              </Keuzelijst>
              <Keuzelijst label="Van team" name="team" hint="Voor captain en meekijker.">
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Keuzelijst>
              <Keuzelijst label="Met de naam" name="deelnemer" hint="Voor familielid en meekijker." defaultValue="">
                <option value="">Geen naam</option>
                {namen.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Keuzelijst>
              <Knop type="submit">Bekijk de app</Knop>
            </form>
          </Kaart>
        ) : null}

        {bestaat ? <ProefLeegmaken /> : null}
      </div>
    </>
  );
}
