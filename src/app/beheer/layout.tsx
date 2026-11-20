import Link from "next/link";
import { Embleem } from "@/components/brand/Embleem";
import { IconThuis } from "@/components/ui/icons";
import { KnopLink } from "@/components/ui/Knop";
import { Scherm } from "@/components/ui/Scherm";

/**
 * Every admin screen: the emblem at the top and a button at the bottom, both
 * back to Thuis (the owner's wish).
 */
export default function BeheerLayout({ children }: LayoutProps<"/beheer">) {
  return (
    <Scherm metTabBalk={false} boven={34}>
      <Link
        href="/"
        aria-label="Terug naar Thuis"
        className="mb-3 inline-flex h-14 w-14 items-center justify-center self-start rounded-pil"
      >
        <Embleem size={52} />
      </Link>
      {children}
      <div className="mt-10 flex justify-center">
        <KnopLink href="/" variant="secundair" className="gap-2">
          <IconThuis size={20} />
          Terug naar Thuis
        </KnopLink>
      </div>
    </Scherm>
  );
}
