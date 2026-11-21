"use client";

import { Melding } from "@/components/ui/Kaart";
import { useWachtrij } from "@/lib/client/offline-uitslagen";
import { bijElkaar } from "@/lib/shared/tekst";

/**
 * Results that still wait for a connection, on the list of games too: the
 * queue keeps sending from here, also after leaving a game screen.
 */
export function Wachtrij() {
  const { items } = useWachtrij(null);
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <Melding tone="info">
        {bijElkaar(
          items.length === 1
            ? "1 uitslag wacht op verbinding. Hij gaat vanzelf zodra er weer internet is."
            : `${items.length} uitslagen wachten op verbinding. Ze gaan vanzelf zodra er weer internet is.`,
        )}
      </Melding>
    </div>
  );
}
