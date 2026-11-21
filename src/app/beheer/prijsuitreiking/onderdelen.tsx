"use client";

import { useActionState } from "react";
import { Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { ceremonieActie, type CeremonieState } from "./actions";

/** One button that sends a ceremony step, with the step the screen showed. */
export function CeremonieKnop({
  actie,
  stap,
  children,
  variant = "primair",
  disabled,
}: {
  actie: "start" | "volgende" | "terug" | "stop";
  stap?: number;
  children: React.ReactNode;
  variant?: "primair" | "secundair-licht" | "tekst";
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<CeremonieState, FormData>(ceremonieActie, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="actie" value={actie} />
      {stap !== undefined ? <input type="hidden" name="stap" value={stap} /> : null}
      <Knop type="submit" variant={variant} size={variant === "primair" ? "groot" : "klein"} disabled={pending || disabled}>
        {pending ? "Bezig…" : children}
      </Knop>
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
    </form>
  );
}
