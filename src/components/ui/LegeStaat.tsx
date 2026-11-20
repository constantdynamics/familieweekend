import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  titel: string;
  children: ReactNode;
  /** Optional extra line in small print, e.g. when something opens. */
  voetnoot?: ReactNode;
  id?: string;
};

/** "Nothing here yet" card: a mustard medallion, a title and a short story. */
export function LegeStaat({ icon, titel, children, voetnoot, id }: Props) {
  const titleId = id ?? `leeg-${titel.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section
      aria-labelledby={titleId}
      className="op-licht flex flex-col items-start gap-3 rounded-kaart-groot bg-beeldbuis p-[22px] text-studio shadow-kaart"
    >
      <span className="flex h-[72px] w-[72px] items-center justify-center rounded-pil bg-mosterd text-studio shadow-[0_5px_0_#9E6A0B]">
        {icon}
      </span>
      <h2 id={titleId} className="m-0 text-[22px] leading-tight font-extrabold">
        {titel}
      </h2>
      <div className="flex flex-col gap-2 text-[16px] leading-[1.45]">{children}</div>
      {voetnoot ? <p className="m-0 text-label font-medium">{voetnoot}</p> : null}
    </section>
  );
}
