"use client";

import { useActionState } from "react";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { bijElkaar } from "@/lib/shared/tekst";
import { importeerQuiz, maakQuiz, type QuizState } from "./actions";

/** Upload a quiz file in the format of SPEC §9.2. */
export function QuizImport() {
  const [state, action, pending] = useActionState<QuizState, FormData>(importeerQuiz, {});
  return (
    <Kaart className="flex flex-col gap-3">
      <h2 className="m-0 text-[20px] font-extrabold">Quizbestand inlezen</h2>
      <p className="m-0 text-[15px] leading-[1.45]">
        {bijElkaar(
          "Een JSON-bestand in het formaat van de SPEC (§9.2), bijvoorbeeld gemaakt met Claude. Het vervangt alle rondes en vragen. Download eerst een backup hieronder.",
        )}
      </p>
      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-[15px] font-bold" htmlFor="quiz-bestand">
          Quizbestand (JSON)
          <input
            id="quiz-bestand"
            name="bestand"
            type="file"
            accept="application/json,.json"
            className="min-h-[52px] w-full rounded-tegel border-[3px] border-studio bg-papier px-3 py-2.5 text-[16px] text-studio"
          />
        </label>
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig met inlezen…" : "Lees de quiz in"}
        </Knop>
      </form>
      {state.fout ? <Melding tone="fout">{bijElkaar(state.fout)}</Melding> : null}
      {state.fouten && state.fouten.length > 0 ? (
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-[1.4]">
          {state.fouten.map((fout, index) => (
            <li key={index}>{bijElkaar(fout)}</li>
          ))}
        </ul>
      ) : null}
      {state.gelukt ? <Melding tone="goed">{bijElkaar(state.gelukt)}</Melding> : null}
      {state.waarschuwingen && state.waarschuwingen.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[15px] font-bold">Let op:</p>
          <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-[1.4]">
            {state.waarschuwingen.map((waarschuwing, index) => (
              <li key={index}>{bijElkaar(waarschuwing)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Kaart>
  );
}

export function MaakQuiz() {
  return (
    <form action={maakQuiz}>
      <Knop type="submit">Maak de vijf rondes</Knop>
    </form>
  );
}
