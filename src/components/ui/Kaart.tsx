import type { ComponentProps, ReactNode } from "react";

/** Light "beeldbuis" card with the hard bottom edge. */
export function Kaart({ className, ...rest }: ComponentProps<"section">) {
  return (
    <section
      className={`op-licht rounded-kaart bg-beeldbuis p-[18px] text-studio shadow-kaart ${className ?? ""}`}
      {...rest}
    />
  );
}

/** Dark inset panel, as behind the countdown and the stopwatch. */
export function Paneel({ className, ...rest }: ComponentProps<"section">) {
  return <section className={`rounded-kaart bg-studio-diep p-4 shadow-inzet ${className ?? ""}`} {...rest} />;
}

/** Mustard label, e.g. "Hemelvaart 2027" or "Beheerder". */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-pil bg-mosterd px-3 py-1 text-label font-bold text-studio ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

/** Screen title in the display letter with the hard orange shadow. */
export function SchermTitel({ children, sub, chip }: { children: ReactNode; sub?: ReactNode; chip?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 pr-10">
      {chip}
      <h1 className="m-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">{children}</h1>
      {sub ? <p className="m-0 text-[15px] text-zand">{sub}</p> : null}
    </div>
  );
}

type Tone = "fout" | "goed" | "info";

/** Inline status line under a form or action. */
export function Melding({ tone, children, id }: { tone: Tone; children: ReactNode; id?: string }) {
  const styles: Record<Tone, string> = {
    fout: "bg-roest text-beeldbuis",
    goed: "bg-avocado-licht text-studio",
    info: "bg-studio-licht text-beeldbuis",
  };
  return (
    <p
      id={id}
      role={tone === "fout" ? "alert" : "status"}
      className={`m-0 rounded-[18px] px-4 py-3 text-[15px] leading-[1.4] font-bold ${styles[tone]}`}
    >
      {children}
    </p>
  );
}
