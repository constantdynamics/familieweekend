import type { Metadata } from "next";
import { Suspense } from "react";
import { IconFoto } from "@/components/ui/icons";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { getRequestContext } from "@/lib/server/context";
import { listFunfactPhotos } from "@/lib/server/funfacts";
import { requireAdmin } from "@/lib/server/session";
import { signedPhotoUrl } from "@/lib/server/uploads";
import { bijElkaar } from "@/lib/shared/tekst";
import { BeheerKop, BeheerLaden, ProefMelding } from "../../onderdelen";
import { FotoKaart } from "../onderdelen";

export const metadata: Metadata = { title: "Echt of AI" };

export default function FotosPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

/**
 * Echt of AI (SPEC §4.6): every fun-fact photo with who sent it. Per photo
 * an AI-edited version, and the choice which one goes into the quiz; the
 * right answer follows from that choice.
 */
async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  const fotos = await listFunfactPhotos(ctx.env);
  const views = await Promise.all(
    fotos.map(async (foto) => ({
      id: foto.id,
      naam: foto.name,
      vraag: foto.questionText,
      echtUrl: await signedPhotoUrl(foto.id, 3600),
      aiUrl: foto.aiId ? await signedPhotoUrl(foto.aiId, 3600) : null,
      versie: foto.quizVariant,
    })),
  );
  const gekozen = fotos.filter((f) => f.quizVariant !== null).length;

  return (
    <>
      <BeheerKop
        titel="Echt of AI"
        sub={bijElkaar(
          fotos.length === 0
            ? "Hier komen de merkwaardige foto's uit de fun facts."
            : `${fotos.length === 1 ? "1 foto" : `${fotos.length} foto's`}, ${gekozen} ${gekozen === 1 ? "staat" : "staan"} klaar voor de quiz.`,
        )}
        terug={{ href: "/beheer/funfacts", label: "Fun facts" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}
      <p className="m-0 mt-3 text-[15px] leading-[1.45] text-zand">
        {bijElkaar(
          "Maak van een foto een met AI bewerkte versie en upload die hier. Kies daarna welke versie in de quiz komt: het goede antwoord volgt daar vanzelf uit.",
        )}
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {views.length === 0 ? (
          <LegeStaat icon={<IconFoto size={34} />} titel="Nog geen foto's">
            <p className="m-0">{bijElkaar("Zodra iemand bij de fun facts een foto uploadt, staat hij hier.")}</p>
          </LegeStaat>
        ) : (
          views.map((foto) => <FotoKaart key={foto.id} foto={foto} />)
        )}
      </div>
    </>
  );
}
