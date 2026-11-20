"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconProgramma, IconQuiz, IconScore, IconThuis, IconZeskamp } from "./icons";

const TABS = [
  { href: "/", label: "Thuis", Icon: IconThuis },
  { href: "/programma", label: "Programma", Icon: IconProgramma },
  { href: "/quiz", label: "Quiz", Icon: IconQuiz },
  { href: "/zeskamp", label: "Zeskamp", Icon: IconZeskamp },
  { href: "/score", label: "Score", Icon: IconScore },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The five main tabs, fixed at the bottom, above the iPhone home indicator. */
export function TabBalk() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hoofdmenu"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-studio-licht bg-studio-tab"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto grid h-20 max-w-[560px] grid-cols-5 px-1.5 pt-1.5 pb-3">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-tegel text-klein no-underline ${
                  active ? "font-bold text-mosterd hover:text-mosterd" : "font-medium text-zand hover:text-beeldbuis"
                }`}
              >
                <span
                  className={`flex h-[30px] w-[52px] items-center justify-center rounded-pil ${
                    active ? "bg-mosterd text-studio" : ""
                  }`}
                >
                  <Icon size={22} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Height to keep free at the bottom of a scrolling screen. */
export const TABBALK_RUIMTE = "calc(80px + env(safe-area-inset-bottom, 0px) + 24px)";
