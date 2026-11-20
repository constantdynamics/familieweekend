import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E } from "../../playwright.config";

export const db = () => postgres(E2E.adminUrl, { max: 1, onnotice: () => {} });

/** Clear rate-limit history and the logbook, and put the defaults back. */
export async function resetState() {
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-local.ts"], {
    env: {
      ...process.env,
      MIGRATION_DATABASE_URL: E2E.adminUrl,
      APP_SECRET: E2E.appSecret,
      VALK_APP_PASSWORD: E2E.appPassword,
      SEED_FAMILY_CODE: E2E.familyCode,
      SEED_ADMIN_PIN: E2E.adminPin,
      SEED_ADMIN_NAME: "Beheerder",
      SEED_RESET: "1",
    },
    stdio: "pipe",
  });
  // The seed writes straight to the database; let the app drop its cached settings.
  const response = await fetch(`http://localhost:${E2E.port}/api/keepalive`, {
    headers: { authorization: `Bearer ${E2E.cronSecret}` },
  });
  if (!response.ok) throw new Error(`keepalive gaf ${response.status}`);
}

/** A moment in November 2026, so countdown screenshots are stable. */
export const VASTE_TIJD = new Date("2026-11-20T14:20:15+01:00");

export async function enterFamilyCode(page: Page, code = E2E.familyCode) {
  await page.goto("/welkom");
  await page.getByLabel("Familiecode").fill(code);
  await page.getByRole("button", { name: "Kom binnen" }).click();
}

export async function loggedIn(page: Page) {
  await enterFamilyCode(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: /De Valkenburger\s*Spelen/ })).toBeVisible();
}

/** Type a PIN on the admin login screen; does not wait for the outcome. */
export async function tryAdminPin(page: Page, pin: string) {
  await page.goto("/beheer");
  await page.getByLabel("Jouw PIN").fill(pin);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Log in as admin and wait until the dashboard is there. */
export async function loginAdmin(page: Page, pin = E2E.adminPin) {
  await tryAdminPin(page, pin);
  await expect(page.getByText(/^Ingelogd als /)).toBeVisible();
}

/**
 * Texts whose last line holds one lonely word, such as "Schaft" under
 * "De Dommelvallei, Borkel en". A forced line break (<br>) is fine.
 * Returns "text … → word" per problem.
 */
export async function losseWoorden(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Woord = { tekst: string; top: number; hoogte: number };
    const verborgen = ".sr-only, [aria-hidden='true'], script, style, noscript, svg, input, textarea, select";

    /** The words of one container, split into segments at <br>. */
    function segmenten(container: Element): Woord[][] {
      const lijst: Woord[][] = [[]];
      const loop = (node: Node) => {
        for (const kind of node.childNodes) {
          if (kind.nodeType === Node.TEXT_NODE) {
            const tekst = kind.textContent ?? "";
            for (const match of tekst.matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(kind, match.index);
              range.setEnd(kind, match.index + match[0].length);
              // A word broken over two lines (at a hyphen) counts on the line where it ends.
              const rect = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).at(-1);
              if (rect) lijst.at(-1)!.push({ tekst: match[0], top: rect.top, hoogte: rect.height });
            }
          } else if (kind instanceof Element) {
            if (kind.tagName === "BR") {
              lijst.push([]);
              continue;
            }
            if (kind.matches(verborgen) || getComputedStyle(kind).display !== "inline") continue;
            loop(kind);
          }
        }
      };
      loop(container);
      return lijst;
    }

    const problemen: string[] = [];
    for (const element of document.body.querySelectorAll("*")) {
      const display = getComputedStyle(element).display;
      if (display === "inline" || display === "none" || element.closest(verborgen)) continue;
      for (const woorden of segmenten(element)) {
        const regels: Woord[][] = [];
        for (const woord of woorden) {
          const regel = regels.at(-1);
          if (regel && Math.abs(woord.top - regel[0].top) < regel[0].hoogte / 2) regel.push(woord);
          else regels.push([woord]);
        }
        if (regels.length >= 2 && regels.at(-1)!.length === 1) {
          const zin = woorden.map((w) => w.tekst).join(" ");
          problemen.push(`${zin.slice(0, 70)} → ${regels.at(-1)![0].tekst}`);
        }
      }
    }
    return problemen;
  });
}
