"use client";

import { useActionState, useState } from "react";
import { IconKlapOpen } from "@/components/ui/icons-prikbord";
import { Tekstvak, Vinkje } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { BOARD, aantal } from "@/lib/shared/board";
import { bijElkaar } from "@/lib/shared/tekst";
import { ChannelChips } from "../../(app)/prikbord/Board";
import { bewaarKanaal, verwijderKanaal, type KanaalState } from "./actions";

export type ChannelView = {
  id: string;
  title: string;
  description: string | null;
  sort: number;
  pinned: boolean;
  staffOnly: boolean;
  readOnly: boolean;
  posts: number;
  replies: number;
  hiddenPosts: number;
};

function Velden({ channel, state, sort }: { channel: ChannelView | null; state: KanaalState; sort: number }) {
  const velden = state.velden ?? {};
  return (
    <>
      <input type="hidden" name="id" value={channel?.id ?? ""} />
      <Veld
        label="Naam"
        name="titel"
        defaultValue={channel?.title}
        maxLength={BOARD.maxChannelTitle}
        autoComplete="off"
        error={velden.titel}
      />
      <Tekstvak
        label="Beschrijving"
        name="beschrijving"
        rows={2}
        defaultValue={channel?.description ?? ""}
        maxLength={BOARD.maxChannelDescription}
        hint={bijElkaar("Eén of twee zinnen over waar het kanaal voor is. Leeg laten mag.")}
        error={velden.beschrijving}
      />
      <Veld
        label="Volgorde"
        name="volgorde"
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        defaultValue={channel?.sort ?? sort}
        error={velden.volgorde}
        className="max-w-[160px]"
      />
      <Vinkje label="Vastzetten bovenaan" name="vastgezet" defaultChecked={channel?.pinned} />
      <Vinkje
        label={bijElkaar("Alleen de spelleiding plaatst")}
        name="spelleiding"
        defaultChecked={channel?.staffOnly}
        hint={bijElkaar("Iedereen leest mee en mag hartjes en duimpjes geven.")}
      />
      <Vinkje
        label="Alleen lezen"
        name="alleenlezen"
        defaultChecked={channel?.readOnly}
        hint={bijElkaar("Niemand plaatst of reageert nog. Jij kunt als spelleiding nog wel plaatsen.")}
      />
    </>
  );
}

/** One channel, folded up; open it to rename, pin, or set who may post. */
export function ChannelForm({ channel }: { channel: ChannelView }) {
  const [state, action, pending] = useActionState<KanaalState, FormData>(bewaarKanaal, {});
  const [weg, wegAction, wegPending] = useActionState<KanaalState, FormData>(verwijderKanaal, {});
  const [zeker, setZeker] = useState(false);
  const stats = [
    channel.posts === 0 ? "Nog geen berichten" : aantal(channel.posts, "bericht", "berichten"),
    channel.replies > 0 ? aantal(channel.replies, "reactie", "reacties") : null,
    channel.hiddenPosts > 0 ? `${channel.hiddenPosts} verborgen` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <details className="group op-licht rounded-kaart bg-beeldbuis text-studio shadow-kaart">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[17px] leading-tight font-extrabold">{bijElkaar(channel.title, 0)}</span>
          <ChannelChips channel={channel} />
          <span className="text-klein">{stats}</span>
        </span>
        <span className="flex-none text-[15px] font-bold underline underline-offset-4 group-open:hidden">Wijzig</span>
        <IconKlapOpen size={22} className="flex-none group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t-2 border-papier-streep p-4">
        <form action={action} className="flex flex-col gap-3" noValidate>
          <Velden channel={channel} state={state} sort={channel.sort} />
          {state.fout ? <Melding tone="fout">{bijElkaar(state.fout)}</Melding> : null}
          {state.gelukt ? <Melding tone="goed">{bijElkaar(state.gelukt)}</Melding> : null}
          <Knop type="submit" disabled={pending}>
            {pending ? "Bezig met bewaren…" : "Bewaar kanaal"}
          </Knop>
        </form>
        {channel.posts === 0 ? (
          zeker ? (
            <form action={wegAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={channel.id} />
              <Melding tone="fout">{bijElkaar(`Weet je het zeker? Kanaal "${channel.title}" gaat weg.`)}</Melding>
              <div className="flex flex-wrap gap-2">
                <Knop type="submit" size="klein" disabled={wegPending}>
                  Ja, verwijder
                </Knop>
                <Knop variant="secundair-licht" size="klein" onClick={() => setZeker(false)}>
                  Nee, laat staan
                </Knop>
              </div>
            </form>
          ) : (
            <Knop variant="secundair-licht" size="klein" className="self-start" onClick={() => setZeker(true)}>
              Verwijder kanaal
            </Knop>
          )
        ) : (
          <p className="m-0 text-label leading-[1.4]">
            {bijElkaar("Een kanaal met berichten blijft staan. Wil je het afsluiten? Zet het op alleen lezen.")}
          </p>
        )}
        {weg.fout ? <Melding tone="fout">{bijElkaar(weg.fout)}</Melding> : null}
      </div>
    </details>
  );
}

/** A new channel. */
export function NewChannel({ sort }: { sort: number }) {
  const [state, action, pending] = useActionState<KanaalState, FormData>(bewaarKanaal, {});
  return (
    <Kaart className="flex flex-col gap-3">
      <h3 className="m-0 text-[19px] font-extrabold">Nieuw kanaal</h3>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Velden channel={null} state={state} sort={sort} />
        {state.fout ? <Melding tone="fout">{bijElkaar(state.fout)}</Melding> : null}
        {state.gelukt ? <Melding tone="goed">{bijElkaar(state.gelukt)}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig met toevoegen…" : "Voeg kanaal toe"}
        </Knop>
      </form>
    </Kaart>
  );
}
