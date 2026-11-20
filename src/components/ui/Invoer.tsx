import { useId, type ComponentProps, type ReactNode } from "react";

/*
 * Form controls for light cards, in the style of Veld: label above, hint
 * and error below, 52 px tall, 3 px studio border.
 */

const kader =
  "w-full rounded-tegel border-[3px] border-studio bg-papier px-3.5 text-[18px] text-studio aria-invalid:border-roest";

function Onder({ id, hint, error }: { id: string; hint?: ReactNode; error?: string | null }) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="m-0 text-label">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-fout`} className="m-0 text-label font-bold text-roest">
          {error}
        </p>
      ) : null}
    </>
  );
}

function described(id: string, hint?: ReactNode, error?: string | null) {
  return [hint ? `${id}-hint` : null, error ? `${id}-fout` : null].filter(Boolean).join(" ") || undefined;
}

type KeuzelijstProps = Omit<ComponentProps<"select">, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
};

/** A native select: works with one thumb and every screen reader. */
export function Keuzelijst({ label, hint, error, className, children, ...select }: KeuzelijstProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-[15px] font-bold">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, hint, error)}
        className={`${kader} min-h-[52px] appearance-none bg-[length:20px] bg-[right_14px_center] bg-no-repeat pr-11`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232B1810' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...select}
      >
        {children}
      </select>
      <Onder id={id} hint={hint} error={error} />
    </div>
  );
}

type TekstvakProps = Omit<ComponentProps<"textarea">, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
};

export function Tekstvak({ label, hint, error, className, rows = 4, ...area }: TekstvakProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-[15px] font-bold">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, hint, error)}
        className={`${kader} min-h-[52px] py-3 leading-[1.4]`}
        {...area}
      />
      <Onder id={id} hint={hint} error={error} />
    </div>
  );
}

type VinkjeProps = Omit<ComponentProps<"input">, "id" | "type"> & { label: ReactNode; hint?: ReactNode };

/** A checkbox with a 44 px tap area. */
export function Vinkje({ label, hint, className, ...input }: VinkjeProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-[16px] font-bold">
        <input
          id={id}
          type="checkbox"
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-6 w-6 flex-none cursor-pointer accent-oranje"
          {...input}
        />
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="m-0 pl-9 text-label">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type SchakelaarProps = {
  aan: boolean;
  label: ReactNode;
  hint?: ReactNode;
  /** Name of the hidden field that carries the new value ("1" or "0"). */
  name?: string;
  disabled?: boolean;
};

/**
 * An on/off switch as a submit button: tapping it sends the opposite value.
 * Put it inside a form with a server action.
 */
export function Schakelaar({ aan, label, hint, name = "waarde", disabled }: SchakelaarProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={`${id}-label`} className="text-[16px] leading-tight font-bold">
          {label}
        </span>
        {hint ? (
          <span id={`${id}-hint`} className="text-label leading-[1.35]">
            {hint}
          </span>
        ) : null}
      </div>
      <button
        type="submit"
        name={name}
        value={aan ? "0" : "1"}
        role="switch"
        aria-checked={aan}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        className={`relative inline-flex h-11 w-[72px] flex-none items-center rounded-pil border-[3px] border-studio transition-colors ${
          aan ? "bg-avocado-licht" : "bg-zand"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-pil bg-studio transition-[left] ${aan ? "left-[34px]" : "left-[4px]"}`}
        />
        <span className="sr-only">{aan ? "Aan" : "Uit"}</span>
      </button>
    </div>
  );
}
