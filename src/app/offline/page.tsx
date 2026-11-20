import type { Metadata } from "next";
import { Embleem } from "@/components/brand/Embleem";
import { IconWifiUit } from "@/components/ui/icons";
import { KnopLink } from "@/components/ui/Knop";
import { Kaart } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";

export const metadata: Metadata = { title: "Geen verbinding" };

/** Shown by the service worker for pages it has never cached. */
export default function OfflinePage() {
  return (
    <Scherm stralen metTabBalk={false} boven={58}>
      <div className="flex flex-col items-center text-center">
        <Embleem size={120} />
        <h1 className="mt-3 mb-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">Geen verbinding</h1>
      </div>
      <Kaart className="mt-6 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd">
            <IconWifiUit size={24} />
          </span>
          <h2 className="m-0 text-[19px] leading-tight font-extrabold">Deze pagina heb je nog niet bekeken</h2>
        </div>
        <p className="m-0 text-[16px] leading-[1.45]">
          Zonder internet laat de app zien wat je eerder hebt geopend. Zoek een plek met bereik of wifi en probeer
          het dan opnieuw.
        </p>
      </Kaart>
      <KnopLink href="/" className="mt-6 self-center">
        Probeer opnieuw
      </KnopLink>
    </Scherm>
  );
}
