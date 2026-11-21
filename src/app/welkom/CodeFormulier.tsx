"use client";

import { useActionState, useSyncExternalStore } from "react";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { useGehydrateerd } from "@/lib/client/gehydrateerd";
import { controleerFamiliecode, type CodeState } from "./actions";

const initial: CodeState = {};

const nietsTeVolgen = () => () => {};
const terugUitAdres = () => new URLSearchParams(window.location.search).get("terug") ?? "";

/**
 * The code form. It is part of the static page and works before JavaScript
 * has loaded (the Server Action posts as a normal form). The return path is
 * read from the URL right after hydration, without replacing the form, so
 * nothing typed in the meantime gets lost.
 */
export function CodeFormulier() {
  const [state, action, pending] = useActionState(controleerFamiliecode, initial);
  const klaar = useGehydrateerd();
  const terug = useSyncExternalStore(nietsTeVolgen, terugUitAdres, () => "");

  return (
    <form action={action} className="flex flex-col gap-4" noValidate data-klaar={klaar ? "" : undefined}>
      <input type="hidden" name="terug" value={terug} />
      <Veld
        label="Familiecode"
        name="code"
        groot
        required
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={40}
        defaultValue={state.code ?? ""}
        key={state.code ?? "leeg"}
        error={state.fout}
        hint={state.fout ? undefined : "Hoofdletters, spaties en streepjes maken niet uit."}
      />
      <Knop type="submit" disabled={pending} className="w-full" size="groot">
        {pending ? "Even kijken…" : "Kom binnen"}
      </Knop>
    </form>
  );
}
