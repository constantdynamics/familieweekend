"use client";

import { useState } from "react";
import { Keuzelijst } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { STAFF_AS, STAFF_AUTHOR } from "@/lib/shared/board";
import { bijElkaar } from "@/lib/shared/tekst";
import { Composer } from "../../(app)/prikbord/Composer";
import { plaatsAlsSpelleiding } from "./actions";

/** Post as "De spelleiding": a notice in a channel of the spelleiding, or an answer anywhere. */
export function StaffPost({ channels, start }: { channels: { id: string; title: string }[]; start: string }) {
  const [channel, setChannel] = useState(start);
  const [done, setDone] = useState<string | null>(null);
  const title = channels.find((c) => c.id === channel)?.title ?? "";
  return (
    <Kaart className="flex flex-col gap-3">
      <h3 className="m-0 text-[19px] font-extrabold">Plaats als De spelleiding</h3>
      <Composer
        mode="nieuw"
        author={{ id: STAFF_AS, name: STAFF_AUTHOR }}
        label="Je bericht"
        onSubmit={async ({ tekst, fotos }) => {
          setDone(null);
          return plaatsAlsSpelleiding({ kanaal: channel, tekst, fotos });
        }}
        onDone={() => setDone(`Bericht geplaatst in ${title}.`)}
      >
        <Keuzelijst label="Kanaal" value={channel} onChange={(event) => setChannel(event.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Keuzelijst>
      </Composer>
      {done ? <Melding tone="goed">{bijElkaar(done)}</Melding> : null}
    </Kaart>
  );
}
