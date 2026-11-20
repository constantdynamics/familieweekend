import { useId, type ComponentProps, type ReactNode } from "react";

type Props = Omit<ComponentProps<"input">, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Larger letters, for codes and PINs. */
  groot?: boolean;
};

/** Text field for light cards: label above, hint and error below. */
export function Veld({ label, hint, error, groot, className, ...input }: Props) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-fout` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-[15px] font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          "min-h-[52px] w-full rounded-tegel border-[3px] border-studio bg-papier px-3.5 text-studio " +
          "placeholder:text-[#8a6a55] aria-invalid:border-roest " +
          (groot ? "text-[24px] font-bold tracking-[0.06em]" : "text-[18px]")
        }
        {...input}
      />
      {hint ? (
        <p id={hintId} className="m-0 text-label">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="m-0 text-label font-bold text-roest">
          {error}
        </p>
      ) : null}
    </div>
  );
}
