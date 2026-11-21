import { Fragment, useMemo } from "react";
import { parseBody } from "@/lib/shared/board";

/**
 * The text of a post. Everything is plain text (React escapes it); only
 * http(s) links become links, opening in a new tab without passing on
 * where they came from. The last two words of a line stay together.
 */
export function PostText({ body, className }: { body: string; className?: string }) {
  const paragraphs = useMemo(() => parseBody(body), [body]);
  if (paragraphs.length === 0) return null;
  return (
    <div className={`flex flex-col gap-2 text-[16px] leading-[1.5] [overflow-wrap:anywhere] ${className ?? ""}`}>
      {paragraphs.map((lines, p) => (
        <p key={p} className="m-0">
          {lines.map((segments, l) => (
            <Fragment key={l}>
              {l > 0 ? <br /> : null}
              {segments.map((segment, s) =>
                segment.link ? (
                  <a
                    key={s}
                    href={segment.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-bold text-studio underline decoration-2 underline-offset-2 hover:text-roest"
                  >
                    {segment.text}
                    <span className="sr-only"> (opent in een nieuw tabblad)</span>
                  </a>
                ) : (
                  <Fragment key={s}>{segment.text}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
