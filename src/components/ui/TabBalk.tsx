"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconPrikbord, IconProgramma, IconQuiz, IconScore, IconThuis, IconZeskamp } from "./icons";

/*
 * Three tabs, chosen by the owner. Quiz, Zeskamp and Score are tiles on Thuis
 * on the day they happen (see docs/BESLISSINGEN.md). Until the delivery the
 * family keeps the menu of phase 1 ("oud").
 */
const TABS = {
  nieuw: [
    { href: "/", label: "Thuis", Icon: IconThuis },
    { href: "/programma", label: "Programma", Icon: IconProgramma },
    { href: "/prikbord", label: "Prikbord", Icon: IconPrikbord },
  ],
  oud: [
    { href: "/", label: "Thuis", Icon: IconThuis },
    { href: "/programma", label: "Programma", Icon: IconProgramma },
    { href: "/quiz", label: "Quiz", Icon: IconQuiz },
    { href: "/zeskamp", label: "Zeskamp", Icon: IconZeskamp },
    { href: "/score", label: "Score", Icon: IconScore },
  ],
} as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The main tabs, fixed at the bottom, above the iPhone home indicator. */
export function TabBalk({ variant = "nieuw" }: { variant?: keyof typeof TABS }) {
  const pathname = usePathname();
  const tabs = TABS[variant];
  return (
    <nav
      aria-label="Hoofdmenu"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-studio-licht bg-studio-tab"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul
        className={`mx-auto grid h-20 max-w-[560px] px-1.5 pt-1.5 pb-3 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-5"}`}
      >
        {tabs.map(({ href, label, Icon }) => {
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
