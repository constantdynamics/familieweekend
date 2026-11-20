type Props = {
  /** The year beside "Spelen", e.g. 2027. */
  jaar: number;
  /** The big version of the welcome screen. */
  groot?: boolean;
  className?: string;
};

/**
 * The name as the screen title: "De Valkenburger", and below it "Spelen"
 * with the year as a mustard label beside it. The label fills the second
 * line, so "Spelen" never stands alone.
 */
export function Woordmerk({ jaar, groot = false, className }: Props) {
  return (
    <h1
      className={`m-0 font-display font-normal text-beeldbuis schaduw-oranje ${
        groot ? "text-[clamp(30px,9.6vw,40px)] leading-[1.06]" : "text-[clamp(30px,9.75vw,38px)] leading-[1.08]"
      } ${className ?? ""}`}
    >
      De Valkenburger
      <br />
      <span className="inline-flex items-center gap-3">
        Spelen
        <span className="rounded-pil bg-mosterd px-3.5 py-1.5 font-sans text-[17px] leading-none font-extrabold text-studio [text-shadow:none]">
          {jaar}
        </span>
      </span>
    </h1>
  );
}
