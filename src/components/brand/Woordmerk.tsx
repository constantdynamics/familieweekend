type Props = {
  /** The year beside "Spelen", e.g. 2027. */
  jaar: number;
  /** The big version of the welcome screen. */
  groot?: boolean;
  className?: string;
};

/**
 * The name as the screen title: "De Valkenburger", and below it "Spelen"
 * with the year beside it in mustard script letters, slanting upwards like
 * a signature. The year fills the second line, so "Spelen" never stands
 * alone.
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
      <span className="inline-flex items-baseline gap-[0.28em]">
        Spelen
        <span className="inline-block origin-bottom-left translate-y-[0.06em] -rotate-6 font-script text-[1.5em] leading-[0.7] text-mosterd schaduw-roest">
          {jaar}
        </span>
      </span>
    </h1>
  );
}
