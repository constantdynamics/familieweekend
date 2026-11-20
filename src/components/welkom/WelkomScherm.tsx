import Link from "next/link";
import { CodeFormulier } from "@/app/welkom/CodeFormulier";
import { Embleem } from "@/components/brand/Embleem";
import { Kaart } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";

/**
 * The start screen: the only thing a stranger with the link sees.
 * No dates or location here, just the name and the code field.
 * The spotlights may shine here: this is the opening of the show.
 */
export function WelkomScherm() {
  return (
    <Scherm spots="sterk" bocht={150} metTabBalk={false} boven={58}>
      <div className="flex flex-col items-center text-center">
        <Embleem size={168} label="Voorlopig embleem: een valk in een lauwerkrans" />
        <h1 className="mt-3 mb-0 font-display text-[clamp(30px,9.6vw,40px)] leading-[1.06] font-normal schaduw-oranje">
          De Valkenburger
          <br />
          Spelen
        </h1>
        <span className="mt-3 rounded-pil bg-mosterd px-4 py-1.5 text-[17px] font-extrabold text-studio">2027</span>
      </div>

      <Kaart aria-labelledby="welkom-titel" className="mt-7 flex flex-col gap-3 p-[22px]!">
        <h2 id="welkom-titel" className="m-0 text-[22px] leading-tight font-extrabold">
          Kom binnen
        </h2>
        <p className="m-0 text-[15px] leading-[1.45]">
          Vul de familiecode in die je in de familie-app kreeg. Je hoeft dat op deze telefoon maar één keer te doen.
        </p>
        <CodeFormulier />
      </Kaart>

      <p className="mt-6 mb-0 text-center text-label text-zand">
        <Link href="/privacy" className="inline-flex min-h-11 items-center text-zand underline underline-offset-4">
          Wat we bewaren en wanneer we het weggooien
        </Link>
      </p>
    </Scherm>
  );
}
