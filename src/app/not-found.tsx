import { Embleem } from "@/components/brand/Embleem";
import { KnopLink } from "@/components/ui/Knop";
import { Scherm } from "@/components/ui/Scherm";

export default function NotFound() {
  return (
    <Scherm stralen metTabBalk={false} boven={58}>
      <div className="flex flex-col items-center text-center">
        <Embleem size={120} />
        <p className="mt-4 mb-0 font-display text-[64px] leading-none text-mosterd">404</p>
        <h1 className="mt-3 mb-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">Deze baan bestaat niet</h1>
        <p className="mt-3 mb-0 max-w-[32ch] text-[16px] leading-[1.45] text-zand">
          De pagina die je zoekt is er niet (meer). Misschien klopt de link niet helemaal.
        </p>
        <KnopLink href="/" className="mt-6">
          Naar thuis
        </KnopLink>
      </div>
    </Scherm>
  );
}
