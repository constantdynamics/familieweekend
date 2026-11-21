import type { Metadata } from "next";
import { KnopLink } from "@/components/ui/Knop";
import { Kaart, SchermTitel } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";

export const metadata: Metadata = { title: "Wat we bewaren" };

const BLOKKEN = [
  {
    titel: "Alleen wat nodig is",
    tekst: [
      "We bewaren je naam zoals de organisatie hem invoert, je team, je antwoorden op de fun facts, je foto en de punten van je team.",
      "Geen e-mailadres, geen telefoonnummer, geen adres.",
    ],
  },
  {
    titel: "Wie wat ziet",
    tekst: [
      "Je fun facts en je foto ziet alleen de organisatie, om de quiz te maken. Jij ziet je eigen antwoorden terug, verder niemand.",
      "Een foto kan in de quiz voorbijkomen bij Echt of AI. Dan zien de teams hem op hun telefoon.",
    ],
  },
  {
    titel: "Cookies",
    tekst: [
      "Je telefoon krijgt een cookie zodat je niet steeds de familiecode hoeft in te vullen, en een cookie die onthoudt dat het dezelfde telefoon is.",
      "Er zijn geen reclame- of volgcookies, en er kijkt geen statistiekdienst mee.",
    ],
  },
  {
    titel: "Wanneer het weg gaat",
    tekst: [
      "Na het weekend wist de organisatie met één knop alle fun facts, foto's en koppelingen tussen namen en telefoons.",
      "Wat blijft is de uitslag van de Spelen.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <Scherm metTabBalk={false}>
      <SchermTitel sub="Kort en eerlijk">Wat we bewaren</SchermTitel>
      <div className="mt-5 flex flex-col gap-4">
        {BLOKKEN.map((blok) => (
          <Kaart key={blok.titel} className="flex flex-col gap-2">
            <h2 className="m-0 text-[19px] leading-tight font-extrabold">{blok.titel}</h2>
            {blok.tekst.map((alinea) => (
              <p key={alinea} className="m-0 text-[16px] leading-[1.45]">
                {alinea}
              </p>
            ))}
          </Kaart>
        ))}
      </div>
      <p className="mt-5 mb-0 text-[15px] leading-[1.45] text-zand">
        Vragen of iets laten weghalen? Stuur de organisatie een berichtje in de <span className="whitespace-nowrap">familie-app</span>.
      </p>
      <KnopLink href="/" variant="secundair" className="mt-5 self-start">
        Terug naar thuis
      </KnopLink>
    </Scherm>
  );
}
