/**
 * The secrecy of the quiz (SPEC §7.3): no question and no right answer can
 * be read from the app or the network before its time. Not in the client
 * bundle, not in /api/quiz/state, /api/live or /api/versie before "open",
 * no right answer before "onthuld", photos only with a short signed link
 * once the question is open, and nothing of it cached.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { resetState } from "./helpers";
import { adminInDeProef, console_, doeMee, stand, toestel, wachtOpFase, wordCaptain, zetProefKlaar } from "./quizHulp";

test.use({ serviceWorkers: "block" });

/** The question texts and explanations of the demo quiz, read from its source. */
function demoTeksten(): { vragen: string[]; uitleg: string[] } {
  const source = readFileSync(path.join("src", "lib", "server", "quiz", "demo.ts"), "utf8");
  const vragen = [...source.matchAll(/\btext: "([^"]+)"/g)].map((match) => match[1]);
  const uitleg = [...source.matchAll(/\bexplanation: "([^"]+)"/g)].map((match) => match[1]);
  return { vragen, uitleg };
}

function bestanden(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? bestanden(full) : [full];
  });
}

test("de clientbundel bevat geen enkele vraag of uitleg van de demo-quiz", () => {
  test.skip(test.info().project.name !== "iphone-390", "Eén keer is genoeg.");
  const { vragen, uitleg } = demoTeksten();
  expect(vragen.length).toBeGreaterThanOrEqual(12);
  const bundel = bestanden(path.join(".next", "static")).filter((file) => /\.(js|css|json|html|txt)$/.test(file));
  expect(bundel.length).toBeGreaterThan(5);
  for (const file of bundel) {
    const inhoud = readFileSync(file, "utf8");
    for (const tekst of [...vragen, ...uitleg]) expect(inhoud.includes(tekst), `${tekst} in ${file}`).toBe(false);
    // The drawn postcards are not in there either.
    expect(inhoud.includes("DEMO_PHOTOS"), file).toBe(false);
  }
  // The service worker never caches the API (and so never a quiz response).
  const sw = readFileSync(path.join("src", "sw", "sw.ts"), "utf8");
  expect(sw).toMatch(/url\.pathname\.startsWith\("\/api\/"\)/);
});

async function haal(page: Page, url: string) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { cache: "no-store" });
    return { status: response.status, tekst: await response.text(), cache: response.headers.get("cache-control") };
  }, url);
}

test("de vraag komt pas bij open, het goede antwoord pas bij onthuld", async ({ page: admin, browser }) => {
  test.setTimeout(180_000);
  await resetState();
  await adminInDeProef(admin);
  const proef = await zetProefKlaar(admin);
  const captain = await toestel(browser);
  await doeMee(captain.page, proef, "Anna Proef");
  await wordCaptain(captain.page, proef.pins.Oranje);
  const meekijker = await toestel(browser);
  await doeMee(meekijker.page, proef, "Bram Proef");
  await meekijker.page.goto("/quiz");

  const vraag = "Op welke dag van de week valt Hemelvaartsdag altijd?";
  const uitleg = "Hemelvaart is altijd op een donderdag.";
  const geheim = (tekst: string) => {
    expect(tekst).not.toContain(vraag);
    expect(tekst).not.toMatch(/\bDonderdag\b/);
    expect(tekst).not.toContain(uitleg);
    expect(tekst).not.toContain("/api/foto/");
  };

  await admin.goto("/beheer/quiz/console");
  await console_(admin, "Start de quiz");
  await wachtOpFase(captain.page, "rondescherm");

  // Round screen: nothing of the question anywhere, for every role.
  for (const telefoon of [captain.page, meekijker.page, admin]) {
    for (const url of ["/api/quiz/state", "/api/live", "/api/versie"]) {
      const antwoord = await haal(telefoon, url);
      expect(antwoord.status).toBe(200);
      expect(antwoord.cache).toContain("no-store");
      geheim(antwoord.tekst);
    }
  }
  await meekijker.page.reload();
  geheim(await meekijker.page.content());

  // Only the quizmaster sees the question and the answer in advance.
  expect((await haal(meekijker.page, "/api/quiz/console")).status).toBe(403);
  expect((await haal(captain.page, "/api/quiz/console")).status).toBe(403);
  expect((await haal(admin, "/api/quiz/console")).tekst).toContain(vraag);

  // Open: the question, but no right answer and no explanation.
  await console_(admin, "Toon vraag 1");
  await wachtOpFase(meekijker.page, "open");
  for (const telefoon of [captain.page, meekijker.page]) {
    const open = await stand(telefoon);
    expect(JSON.stringify(open)).toContain(vraag);
    expect((open.question as { correct: unknown; explanation: unknown }).correct).toBeNull();
    expect(JSON.stringify(open)).not.toContain(uitleg);
  }
  // Answers of other teams stay hidden: the meekijker does not even get its own team's answer.
  await captain.page.getByRole("button", { name: /Donderdag/ }).click();
  await expect(captain.page.getByRole("button", { name: /Donderdag/ })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => JSON.stringify(await stand(meekijker.page))).toContain('"teamAnswered":true');
  expect(JSON.stringify(await stand(meekijker.page))).not.toContain('"choice"');

  await console_(admin, "Sluit de vraag");
  await wachtOpFase(meekijker.page, "gesloten");
  expect(JSON.stringify(await stand(meekijker.page))).not.toContain(uitleg);

  // Revealed: now the right answer and the explanation.
  await console_(admin, "Onthul het antwoord");
  await wachtOpFase(meekijker.page, "onthuld");
  const onthuld = await stand(meekijker.page);
  expect((onthuld.question as { correct: unknown }).correct).toBe(2);
  expect(JSON.stringify(onthuld)).toContain(uitleg);

  // A photo only comes with a signed link once its question is open, and that link cannot be bent.
  for (const knop of ["Volgende vraag", "Sluit de vraag", "Onthul het antwoord", "Volgende vraag", "Sluit de vraag", "Onthul het antwoord", "Naar de tussenstand", "Start ronde 2"]) {
    await console_(admin, knop);
  }
  await wachtOpFase(meekijker.page, "rondescherm");
  expect(JSON.stringify(await stand(meekijker.page))).not.toContain("/api/foto/");
  await console_(admin, "Toon vraag 1");
  await wachtOpFase(meekijker.page, "open");
  const foto = ((await stand(meekijker.page)).question as { photoUrl: string }).photoUrl;
  expect(foto).toMatch(/^\/api\/foto\/[0-9a-f-]+\?t=\d+&s=/);
  const echt = await meekijker.page.request.get(foto);
  expect(echt.status()).toBe(200);
  expect(echt.headers()["content-type"]).toBe("image/jpeg");
  const verlopen = Number(new URL(foto, "http://x").searchParams.get("t"));
  expect(verlopen - Date.now() / 1000).toBeLessThanOrEqual(6 * 60);
  const nep = await meekijker.page.request.get(foto.replace(/s=[^&]+/, "s=nep"));
  expect(nep.status()).toBe(403);

  await captain.context.close();
  await meekijker.context.close();
});
