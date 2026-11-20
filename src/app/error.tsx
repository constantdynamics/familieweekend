"use client";

import { useEffect } from "react";
import { Embleem } from "@/components/brand/Embleem";
import { Knop, KnopLink } from "@/components/ui/Knop";
import { Scherm } from "@/components/ui/Scherm";

export default function Fout({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Scherm stralen metTabBalk={false} boven={58}>
      <div className="flex flex-col items-center text-center">
        <Embleem size={120} />
        <h1 className="mt-4 mb-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">Valse start!</h1>
        <p className="mt-3 mb-0 max-w-[34ch] text-[16px] leading-[1.45] text-zand">
          Er ging iets mis bij het laden van dit scherm. Probeer het nog een keer; blijft het misgaan, laat het de
          organisatie weten.
        </p>
        {error.digest ? <p className="mt-2 mb-0 text-klein text-zand">Foutcode {error.digest}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Knop onClick={reset}>Probeer opnieuw</Knop>
          <KnopLink href="/" variant="secundair">
            Naar thuis
          </KnopLink>
        </div>
      </div>
    </Scherm>
  );
}
