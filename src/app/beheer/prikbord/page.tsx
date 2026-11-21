import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Schakelaar } from "@/components/ui/Invoer";
import { Kaart } from "@/components/ui/Kaart";
import { KnopLink } from "@/components/ui/Knop";
import { adminChannels, boardViewer, nextChannelSort, recentPosts } from "@/lib/server/board";
import { getRequestContext } from "@/lib/server/context";
import { requireAdmin } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { bijElkaar } from "@/lib/shared/tekst";
import { BeheerKop, BeheerLaden } from "../onderdelen";
import { zetPrikbordOpen } from "./actions";
import { ChannelForm, NewChannel } from "./ChannelForm";
import { ModerationItem } from "./ModerationItem";
import { StaffPost } from "./StaffPost";

export const metadata: Metadata = { title: "Prikbord beheren" };

const PER_PAGINA = 30;

/** When the page was rendered; relative times start here. */
function renderMoment(): number {
  return Date.now();
}

export default function BeheerPrikbordPage({ searchParams }: PageProps<"/beheer/prikbord">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud searchParams={searchParams} />
    </Suspense>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function Inhoud({ searchParams }: { searchParams: PageProps<"/beheer/prikbord">["searchParams"] }) {
  await requireAdmin();
  const [ctx, settings, params] = await Promise.all([getRequestContext(), readSettings(), searchParams]);
  const viewer = boardViewer(ctx, settings);
  const onlyHidden = first(params.toon) === "verborgen";
  const wanted = Number(first(params.aantal));
  const limit = Number.isInteger(wanted) && wanted > PER_PAGINA ? Math.min(300, wanted) : PER_PAGINA;
  const [channels, posts, sort] = await Promise.all([
    adminChannels(),
    recentPosts({ onlyHidden, limit, viewer }),
    nextChannelSort(),
  ]);
  const hidden = channels.reduce((sum, c) => sum + c.hiddenPosts, 0);
  const start = channels.find((c) => c.staffOnly)?.id ?? channels[0]?.id ?? "";
  const renderedAt = renderMoment();
  const filters = [
    { href: "/beheer/prikbord#berichten", label: "Alle berichten", active: !onlyHidden },
    { href: "/beheer/prikbord?toon=verborgen#berichten", label: `Verborgen (${hidden})`, active: onlyHidden },
  ];

  return (
    <>
      <BeheerKop
        titel="Prikbord"
        sub={bijElkaar("Kanalen, berichten en mededelingen. Het prikbord blijft staan voor volgend jaar.")}
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {ctx.env === "test" ? (
        <p className="m-0 mt-4 rounded-[16px] border-2 border-dashed border-mosterd bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] font-bold text-mosterd">
          {bijElkaar("Je zit in de proefmodus, maar het prikbord is echt: wat je hier doet, ziet de hele familie.")}
        </p>
      ) : null}

      <nav aria-label="Op deze pagina" className="mt-4 flex flex-wrap gap-2">
        {[
          ["#mededeling", "Plaatsen"],
          ["#kanalen", "Kanalen"],
          ["#berichten", "Berichten"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center rounded-pil bg-studio-licht px-4 text-[15px] font-bold text-beeldbuis no-underline hover:text-beeldbuis"
          >
            {label}
          </a>
        ))}
      </nav>

      <Kaart className="mt-5 flex flex-col gap-3">
        <form action={zetPrikbordOpen}>
          <Schakelaar
            aan={settings.boardOpen}
            label="Prikbord open"
            hint={bijElkaar("Staat dit uit, dan kan de familie alleen lezen. Jij kunt als spelleiding nog wel plaatsen.")}
          />
        </form>
        <KnopLink href="/prikbord" variant="secundair-licht" size="klein" className="self-start">
          Bekijk het prikbord
        </KnopLink>
      </Kaart>

      <section id="mededeling" aria-labelledby="mededeling-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="mededeling-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Plaatsen
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">
          {bijElkaar("Een mededeling, of een antwoord op een vraag: als De spelleiding, in elk kanaal.")}
        </p>
        {channels.length > 0 ? (
          <StaffPost channels={channels.map((c) => ({ id: c.id, title: c.title }))} start={start} />
        ) : null}
      </section>

      <section id="kanalen" aria-labelledby="kanalen-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="kanalen-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Kanalen
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">
          {bijElkaar("Vastgezette kanalen staan bovenaan, daarna gaat het op volgorde.")}
        </p>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {channels.map((channel) => (
            <li key={channel.id}>
              <ChannelForm
                channel={{
                  id: channel.id,
                  title: channel.title,
                  description: channel.description,
                  sort: channel.sort,
                  pinned: channel.pinned,
                  staffOnly: channel.staffOnly,
                  readOnly: channel.readOnly,
                  posts: channel.posts,
                  replies: channel.replies,
                  hiddenPosts: channel.hiddenPosts,
                }}
              />
            </li>
          ))}
        </ul>
        <NewChannel sort={sort} />
      </section>

      <section id="berichten" aria-labelledby="berichten-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="berichten-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Berichten
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">
          {bijElkaar("Nieuwste eerst, ook reacties en verborgen berichten. Verbergen kun je terugdraaien, verwijderen niet.")}
        </p>
        <nav aria-label="Welke berichten" className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link
              key={filter.label}
              href={filter.href}
              aria-current={filter.active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-pil px-4 text-[15px] font-bold no-underline ${
                filter.active ? "bg-mosterd text-studio hover:text-studio" : "bg-studio-licht text-beeldbuis hover:text-beeldbuis"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
        {posts.posts.length === 0 ? (
          <p className="m-0 rounded-[18px] bg-studio-licht px-4 py-3.5 text-[15px] text-zand">
            {onlyHidden ? "Er zijn geen verborgen berichten." : bijElkaar("Nog niemand heeft iets geplaatst.")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {posts.posts.map((post) => (
              <ModerationItem key={post.id} post={post} renderedAt={renderedAt} ownName={viewer.names[0] ?? null} />
            ))}
          </ul>
        )}
        {posts.more ? (
          <KnopLink
            href={`/beheer/prikbord?${onlyHidden ? "toon=verborgen&" : ""}aantal=${limit + PER_PAGINA}#berichten`}
            variant="secundair"
            className="self-start"
          >
            Toon oudere berichten
          </KnopLink>
        ) : null}
      </section>
    </>
  );
}
