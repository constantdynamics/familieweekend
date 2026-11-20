import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primair" | "secundair" | "secundair-licht" | "tekst";
type Size = "normaal" | "groot" | "klein";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pil text-center no-underline select-none " +
  "transition-[transform,box-shadow,background-color] duration-150 ease-out " +
  "disabled:opacity-60 aria-disabled:opacity-60";

const variants: Record<Variant, string> = {
  primair:
    "bg-oranje text-studio font-extrabold shadow-knop hover:text-studio " +
    "active:translate-y-[3px] active:shadow-knop-in",
  secundair:
    "border-2 border-zand bg-transparent text-beeldbuis font-bold hover:text-beeldbuis " +
    "active:translate-y-px hover:bg-studio-licht",
  "secundair-licht":
    "border-2 border-studio bg-transparent text-studio font-bold hover:text-studio " +
    "active:translate-y-px hover:bg-papier",
  tekst: "bg-transparent text-zand font-medium underline underline-offset-4 hover:text-beeldbuis",
};

const sizes: Record<Size, string> = {
  normaal: "min-h-12 px-[22px] text-[17px]",
  groot: "min-h-[58px] px-6 text-[18px]",
  klein: "min-h-11 px-4 text-[15px]",
};

function classes(variant: Variant, size: Size, extra?: string) {
  return [base, variants[variant], sizes[size], extra].filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Knop({ variant = "primair", size = "normaal", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={classes(variant, size, className)} {...rest} />;
}

type LinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export function KnopLink({ variant = "primair", size = "normaal", className, ...rest }: LinkProps) {
  return <Link className={classes(variant, size, className)} {...rest} />;
}
