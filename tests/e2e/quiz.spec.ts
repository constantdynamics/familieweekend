/**
 * The quiz end to end (SPEC §7.5): a mini-quiz in the test environment with
 * one quizmaster, four captains and two meekijkers, each on their own
 * "phone", with a joker, "Nog 10 seconden!", a map question, listening
 * mode, the intermezzo, a captain device that is taken over, and a phone
 * that reconnects. Every quiz screen is checked and photographed at 390
 * and 360 px.
 */
import { expect, test, type Page } from "@playwright/test";
import { resetState } from "./helpers";
import { adminInDeProef, check, console_, doeMee, nepTegels, stand, toestel, wachtOpFase, wordCaptain, zetProefKlaar, type Toestel } from "./quizHulp";

test.use({ reducedMotion: "reduce", serviceWorkers: "block" });

test.beforeEach(async () => {
  await resetState();
});

const KLEUREN = ["Oranje", "Mosterd", "Avocado", "Petrol"] as const;
type Kleur = (typeof KLEUREN)[number];
const CAPTAINS: Record<Kleur, string> = { Oranje: "Anna Proef", Mosterd: "Daan Proef", Avocado: "Gijs Proef", Petrol: "Jet Proef" };

/** One console step, and wait until a phone shows the phase that follows. */
async function stap(admin: Page, knop: string | RegExp, telefoon: Page, fase: string, status = "quiz") {
  await console_(admin, knop);
  await wachtOpFase(telefoon, fase, status);
}

async function antwoordViaApp(page: Page, antwoord: unknown) {
  const vraag = ((await stand(page)).question as { id: string } | null)?.id;
  return page.evaluate(
    async ({ vraag, antwoord }) => {
      const response = await fetch("/api/quiz/antwoord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vraag, antwoord }),
      });
      return { status: response.status, body: await response.json() };
    },
    { vraag, antwoord },
  );
}

test("een mini-quiz met quizmaster, vier captains en twee meekijkers", async ({ page: admin, browser }) => {
  test.setTimeout(420_000);
  await nepTegels(admin.context());
  await adminInDeProef(admin);
  const proef = await zetProefKlaar(admin);

  const captain = {} as Record<Kleur, Toestel>;
  for (const kleur of KLEUREN) {
    captain[kleur] = await toestel(browser);
    await doeMee(captain[kleur].page, proef, CAPTAINS[kleur]);
    await wordCaptain(captain[kleur].page, proef.pins[kleur]);
  }
  // Meekijkers: Bram in the team of Oranje, Eva in the team of Mosterd.
  const bram = await toestel(browser);
  await doeMee(bram.page, proef, "Bram Proef");
  const eva = await toestel(browser);
  await doeMee(eva.page, proef, "Eva Proef");
  await bram.page.goto("/quiz");
  await eva.page.goto("/quiz");
  await expect(bram.page.getByRole("heading", { level: 1, name: "De quiz" })).toBeVisible();

  // Bram's phone misses the start: it hears of the start and Petrol's joker in one go
  // (its state requests wait), and must still show the joker banner.
  let laatBramDoor = () => {};
  const bramMagDoor = new Promise<void>((resolve) => (laatBramDoor = resolve));
  await bram.page.route("**/api/quiz/state", async (route) => {
    await bramMagDoor;
    // The phone may have given up on a request that waited: then there is nothing to continue.
    await route.continue().catch(() => {});
  });

  // The quizmaster starts the demo quiz.
  await admin.goto("/beheer/quiz/console");
  await expect(admin.getByRole("heading", { name: "Start de quiz" })).toBeVisible();
  await check(admin, "70-quizmaster-start");
  await console_(admin, "Start de quiz");
  await expect(admin.getByRole("button", { name: "Toon vraag 1" })).toBeVisible();
  await check(admin, "71-quizmaster-rondescherm");

  // Round screen on every phone; no question has left the server yet.
  for (const kleur of KLEUREN) await wachtOpFase(captain[kleur].page, "rondescherm");
  const oranje = captain.Oranje.page;
  await expect(oranje.getByRole("heading", { level: 1, name: /Hemelvaart en\sMoederdag/ })).toBeVisible();
  const vooraf = JSON.stringify(await stand(eva.page));
  expect(vooraf).not.toContain("Hemelvaartsdag");
  expect(vooraf).not.toContain("Donderdag");
  await check(oranje, "40-quiz-rondescherm-captain");

  // Team Petrol plays its joker; everyone sees it.
  const petrol = captain.Petrol.page;
  await petrol.getByRole("button", { name: "Speel de joker in ronde 1" }).click();
  await petrol.getByRole("button", { name: "Ja, speel de joker" }).click();
  await expect.poll(async () => ((await stand(eva.page)).jokers as unknown[]).length).toBe(1);
  laatBramDoor();
  await bram.page.unroute("**/api/quiz/state");
  await expect(bram.page.getByText(/Proefteam Petrol speelt de joker in ronde\s1!/).first()).toBeVisible({ timeout: 15_000 });
  await check(bram.page, "41-quiz-jokerbanier", { scroll: false });
  await expect(petrol.getByRole("button", { name: /Speel de joker/ })).toHaveCount(0);

  // Question 1 (meerkeuze): all captains answer, Mosterd changes its mind.
  await console_(admin, "Toon vraag 1");
  for (const kleur of KLEUREN) await wachtOpFase(captain[kleur].page, "open");
  await expect(oranje.getByRole("button", { name: /Donderdag/ })).toBeVisible();
  await oranje.getByRole("button", { name: /Donderdag/ }).click();
  await expect(oranje.getByRole("button", { name: /Donderdag/ })).toHaveAttribute("aria-pressed", "true");
  await captain.Mosterd.page.getByRole("button", { name: /Maandag/ }).click();
  await expect(captain.Mosterd.page.getByRole("button", { name: /Maandag/ })).toHaveAttribute("aria-pressed", "true");
  await captain.Mosterd.page.getByRole("button", { name: /Woensdag/ }).click();
  await expect(captain.Mosterd.page.getByRole("button", { name: /Woensdag/ })).toHaveAttribute("aria-pressed", "true");
  await captain.Avocado.page.getByRole("button", { name: /Donderdag/ }).click();
  await expect(captain.Avocado.page.getByRole("button", { name: /Donderdag/ })).toHaveAttribute("aria-pressed", "true");
  await petrol.getByRole("button", { name: /Donderdag/ }).click();
  await expect(petrol.getByRole("button", { name: /Donderdag/ })).toHaveAttribute("aria-pressed", "true");
  // The meekijker sees who chose, not what.
  await expect(bram.page.getByText(/Anna Proef heeft gekozen, wijzigen kan\snog/)).toBeVisible({ timeout: 15_000 });
  await expect(bram.page.getByRole("button", { name: /Donderdag/ })).toHaveCount(0);
  expect(JSON.stringify(await stand(bram.page))).not.toContain('"choice"');
  await expect(admin.getByText(/4 van 4 teams hebben\sgeantwoord/)).toBeVisible({ timeout: 15_000 });
  await check(oranje, "42-quiz-vraag-captain");
  await check(bram.page, "43-quiz-vraag-meekijker");
  await check(admin, "72-quizmaster-vraag");

  // A meekijker cannot answer.
  const nee = await antwoordViaApp(bram.page, { choice: 2 });
  expect(nee.status).toBe(403);

  // "Nog 10 seconden!": the phones count down and the question closes by itself.
  await console_(admin, "Nog 10 seconden!");
  await expect(captain.Avocado.page.getByText(/seconden!/).last()).toBeVisible({ timeout: 15_000 });
  await check(captain.Avocado.page, "44-quiz-nog-10-seconden", { scroll: false });
  // The visible line, not the announcement for screen readers that may be there at the same time.
  await expect(captain.Avocado.page.getByText(/De vraag is gesloten\.\sEven\swachten/)).toBeVisible({ timeout: 25_000 });
  const telaat = await antwoordViaApp(oranje, { choice: 1 });
  expect(telaat.status).toBe(409);
  await check(captain.Avocado.page, "45-quiz-gesloten");

  // The reveal.
  await stap(admin, "Onthul het antwoord", petrol, "onthuld");
  await expect(petrol.getByText(/met de joker zelfs\s\+2/)).toBeVisible({ timeout: 15_000 });
  await expect(captain.Mosterd.page.getByText(/Helaas, dat was niet\sgoed/)).toBeVisible({ timeout: 15_000 });
  await expect(oranje.getByText(/Goed!\s\+1\spunt/)).toBeVisible({ timeout: 15_000 });
  await check(petrol, "46-quiz-onthuld-joker");
  await check(captain.Mosterd.page, "47-quiz-onthuld-fout");
  await expect(eva.page.getByText(/Helaas/)).toBeVisible({ timeout: 15_000 });
  await check(eva.page, "48-quiz-onthuld-meekijker");
  await check(admin, "73-quizmaster-onthuld");

  // Question 2 (waar of niet waar).
  await stap(admin, "Volgende vraag", oranje, "open");
  await oranje.getByRole("button", { name: /^Zon: Waar/ }).click();
  await expect(oranje.getByRole("button", { name: /^Zon: Waar/ })).toHaveAttribute("aria-pressed", "true");
  await captain.Avocado.page.getByRole("button", { name: /^Zon: Waar/ }).click();
  await captain.Mosterd.page.getByRole("button", { name: /Niet waar/ }).click();
  await expect(captain.Mosterd.page.getByRole("button", { name: /Niet waar/ })).toHaveAttribute("aria-pressed", "true");
  await check(oranje, "49-quiz-waar-niet-waar");
  await stap(admin, "Sluit de vraag", oranje, "gesloten");
  await stap(admin, "Onthul het antwoord", oranje, "onthuld");

  // Question 3 (schatting): the closest team scores.
  await stap(admin, "Volgende vraag", oranje, "open");
  for (const [kleur, cijfers] of [
    ["Oranje", ["4", "0"]],
    ["Mosterd", ["3", "5"]],
    ["Avocado", ["3", "9"]],
  ] as const) {
    const telefoon = captain[kleur].page;
    for (const cijfer of cijfers) await telefoon.getByRole("button", { name: cijfer, exact: true }).click();
    if (kleur === "Oranje") await check(telefoon, "50-quiz-schatting");
    await telefoon.getByRole("button", { name: "Verstuur je schatting" }).click();
    await expect(telefoon.getByRole("button", { name: "Verstuurd" })).toBeVisible();
  }
  await stap(admin, "Sluit de vraag", oranje, "gesloten");
  await stap(admin, "Onthul het antwoord", captain.Avocado.page, "onthuld");
  await expect(captain.Avocado.page.getByText(/Jullie zaten er het dichtst\sbij/)).toBeVisible({ timeout: 15_000 });
  await check(captain.Avocado.page, "51-quiz-schatting-onthuld");

  // Interim standing after round 1: Avocado 3, Oranje 2, Petrol 2 (joker), Mosterd 0.
  await stap(admin, "Naar de tussenstand", eva.page, "tussenstand");
  const tussen = (await stand(eva.page)).standings as { name: string; place: number; twelfths: number; shared: boolean }[];
  expect(tussen.map((rij) => [rij.name, rij.place, rij.twelfths / 12])).toEqual([
    ["Proefteam Avocado", 1, 3],
    ["Proefteam Oranje", 2, 2],
    ["Proefteam Petrol", 2, 2],
    ["Proefteam Mosterd", 4, 0],
  ]);
  await expect(eva.page.getByRole("heading", { name: /Tussenstand na ronde\s1/ })).toBeVisible({ timeout: 15_000 });
  await check(eva.page, "52-quiz-tussenstand");
  await check(admin, "74-quizmaster-tussenstand");

  // Round 2: a map question in the style of GeoGuessr.
  await stap(admin, "Start ronde 2", oranje, "rondescherm");
  await stap(admin, "Toon vraag 1", oranje, "open");
  // Three Street View photos of the same place, in a strip to swipe through.
  const fotos = oranje.getByRole("img", { name: /^Foto bij vraag 1, \d van 3$/ });
  await expect(fotos).toHaveCount(3);
  await expect(oranje.getByText(/^3\sfoto's\svan\sdezelfde\splek/)).toBeVisible();
  await expect(fotos.first()).toBeInViewport();
  await expect(fotos.last()).not.toBeInViewport();
  const strook = oranje.getByRole("list", { name: "Veeg opzij voor de volgende foto" });
  await strook.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "instant" }));
  await expect(fotos.last()).toBeInViewport();
  await expect(fotos.first()).not.toBeInViewport();
  await strook.evaluate((el) => el.scrollTo({ left: 0, behavior: "instant" }));
  await expect(oranje.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 15_000 });
  await oranje.getByRole("button", { name: "Zet speld hier" }).click();
  await expect(oranje.getByRole("button", { name: "Verplaats je speld hierheen" })).toBeVisible();
  await check(oranje, "53-quiz-kaart-captain");
  // Mosterd puts its pin right on the Valkenburgerstraat.
  expect((await antwoordViaApp(captain.Mosterd.page, { lat: 52.37, lng: 4.905 })).status).toBe(200);
  await expect(bram.page.getByText(/Anna Proef heeft gekozen/)).toBeVisible({ timeout: 15_000 });
  await check(bram.page, "54-quiz-kaart-meekijker");

  // The captain of Petrol takes over the team device with a new phone.
  const petrol2 = await toestel(browser);
  await doeMee(petrol2.page, proef, null);
  await wordCaptain(petrol2.page, proef.pins.Petrol);
  await expect(petrol.getByText("Je teamtoestel is overgenomen door een ander toestel.")).toBeVisible({ timeout: 15_000 });
  await check(petrol, "55-quiz-overgenomen");
  expect((await antwoordViaApp(petrol, { lat: 52.1, lng: 5.1 })).status).toBe(403);
  expect((await antwoordViaApp(petrol2.page, { lat: 48.8566, lng: 2.3522 })).status).toBe(200);

  await stap(admin, "Sluit de vraag", bram.page, "gesloten");
  await stap(admin, "Onthul het antwoord", bram.page, "onthuld");
  await expect(bram.page.getByRole("list", { name: "Spelden van de teams" })).toBeVisible({ timeout: 15_000 });
  const kaart = (await stand(bram.page)).teams as { name: string; result: { twelfths: number; distanceKm: number | null } }[];
  const punten = Object.fromEntries(kaart.map((team) => [team.name, team.result.twelfths / 12]));
  expect(punten).toEqual({ "Proefteam Oranje": 1, "Proefteam Mosterd": 3, "Proefteam Avocado": 0, "Proefteam Petrol": 0 });
  await check(bram.page, "56-quiz-kaart-onthuld");

  // The rest of round 2 without answers.
  for (let vraag = 2; vraag <= 3; vraag += 1) {
    await stap(admin, "Volgende vraag", bram.page, "open");
    await stap(admin, "Sluit de vraag", bram.page, "gesloten");
    await stap(admin, "Onthul het antwoord", bram.page, "onthuld");
  }
  await stap(admin, "Naar de tussenstand", bram.page, "tussenstand");

  // Round 3: listening mode. Meekijkers only see "Luister goed", captains the answers.
  await stap(admin, "Start ronde 3", bram.page, "rondescherm");
  await stap(admin, "Toon vraag 1", bram.page, "open");
  await expect(bram.page.getByRole("heading", { name: "Luister goed" })).toBeVisible({ timeout: 15_000 });
  const luister = await stand(bram.page);
  expect(luister.question).toBeNull();
  expect(JSON.stringify(luister)).not.toContain("lievelingsnummer");
  await check(bram.page, "57-quiz-luister-goed", { scroll: false });
  await expect(oranje.getByRole("button", { name: /Daan\sProef/ })).toBeVisible({ timeout: 15_000 });
  await oranje.getByRole("button", { name: /Daan\sProef/ }).click();
  await check(oranje, "58-quiz-luistermodus-captain");
  await expect(admin.getByText(/Speel op Spotify: Dancing Queen/)).toBeVisible();
  await check(admin, "75-quizmaster-luistermodus");
  // The switch in the console turns listening mode off for everyone.
  await admin.getByRole("switch", { name: "Luistermodus" }).click();
  await expect(bram.page.getByRole("heading", { name: /Van wie is dit het\slievelingsnummer\?/ })).toBeVisible({ timeout: 15_000 });
  await admin.getByRole("switch", { name: "Luistermodus" }).click();
  await stap(admin, "Sluit de vraag", bram.page, "gesloten");
  await stap(admin, "Onthul het antwoord", bram.page, "onthuld");
  await stap(admin, "Volgende vraag", bram.page, "open");
  await stap(admin, "Sluit de vraag", bram.page, "gesloten");
  await stap(admin, "Onthul het antwoord", bram.page, "onthuld");

  // "Ga terug naar vorige vraag" and forward again.
  await stap(admin, "Ga terug naar vorige vraag", bram.page, "onthuld");
  expect(((await stand(bram.page)).questionAt as { number: number }).number).toBe(1);
  await stap(admin, "Volgende vraag", bram.page, "open");
  await stap(admin, "Sluit de vraag", bram.page, "gesloten");
  await stap(admin, "Onthul het antwoord", bram.page, "onthuld");
  await stap(admin, "Naar de tussenstand", bram.page, "tussenstand");

  // The intermezzo after round 3, and back to the quiz.
  await stap(admin, "Start het intermezzo", bram.page, "tussenstand", "intermezzo");
  await expect(bram.page.getByRole("heading", { level: 1, name: "Intermezzo" })).toBeVisible({ timeout: 15_000 });
  await check(bram.page, "59-quiz-intermezzo");
  await check(admin, "76-quizmaster-intermezzo");
  await stap(admin, "Terug naar de quiz", bram.page, "rondescherm");

  // A phone that drops off and comes back sits on the right question at once.
  await eva.context.setOffline(true);
  await console_(admin, "Toon vraag 1");
  await wachtOpFase(bram.page, "open");
  await eva.context.setOffline(false);
  await expect(eva.page.getByRole("heading", { name: /Valkenswaard vroeger/ })).toBeVisible({ timeout: 20_000 });
  await bram.page.reload();
  await expect(bram.page.getByRole("heading", { name: /Valkenswaard vroeger/ })).toBeVisible();

  await stap(admin, "Sluit de vraag", bram.page, "gesloten");
  await stap(admin, "Onthul het antwoord", bram.page, "onthuld");
  await stap(admin, "Volgende vraag", bram.page, "open");
  await stap(admin, "Sluit de vraag", bram.page, "gesloten");
  await stap(admin, "Onthul het antwoord", bram.page, "onthuld");
  await stap(admin, "Naar de tussenstand", bram.page, "tussenstand");

  // Round 5: Echt of AI.
  await stap(admin, "Start ronde 5", oranje, "rondescherm");
  await stap(admin, "Toon vraag 1", oranje, "open");
  await expect(oranje.getByText(/Ingezonden door Bram Proef, Proefteam\sOranje/)).toBeVisible();
  await oranje.getByRole("button", { name: /: AI/ }).click();
  await expect(oranje.getByRole("button", { name: /: AI/ })).toHaveAttribute("aria-pressed", "true");
  await check(oranje, "60-quiz-echt-of-ai");
  await stap(admin, "Sluit de vraag", oranje, "gesloten");
  await stap(admin, "Onthul het antwoord", oranje, "onthuld");

  // A correction by the quizmaster.
  await admin.getByText("Corrigeer punten").click();
  await admin.getByLabel("Welke vraag?").selectOption({ label: "Ronde 1, vraag 1: Op welke dag van de week valt Hemelvaartsdag altijd?" });
  const mosterd = admin.getByRole("listitem").filter({ hasText: /Mosterd/ }).filter({ has: admin.getByLabel("Punten") });
  await mosterd.getByLabel("Punten").fill("1");
  await mosterd.getByRole("button", { name: "Bewaar" }).click();
  await expect(admin.getByText("Punten gecorrigeerd.")).toBeVisible();
  await check(admin, "77-quizmaster-correctie");

  await stap(admin, "Volgende vraag", oranje, "open");
  await stap(admin, "Sluit de vraag", oranje, "gesloten");
  await stap(admin, "Onthul het antwoord", oranje, "onthuld");
  await stap(admin, "Naar de tussenstand", oranje, "tussenstand");
  await stap(admin, "Naar de eindstand", eva.page, "einde");
  const eind = (await stand(eva.page)).standings as { name: string; twelfths: number }[];
  // Mosterd got 1 point back for question 1, and 3 for the map.
  expect(eind.find((rij) => rij.name === "Proefteam Mosterd")?.twelfths).toBe(48);
  await expect(eva.page.getByRole("heading", { name: /Eindstand\svan\sde\squiz/ })).toBeVisible({ timeout: 15_000 });
  await check(eva.page, "61-quiz-einde");
  await check(admin, "78-quizmaster-einde");

  // The quiz is over: the menu comes back, with the final standing above the story.
  await console_(admin, "Sluit de quiz af");
  await wachtOpFase(eva.page, "einde", "rust");
  await expect(eva.page.getByRole("navigation", { name: "Hoofdmenu" })).toBeVisible({ timeout: 15_000 });
  await check(eva.page, "62-quiz-na-afloop");

  for (const telefoon of [...Object.values(captain), bram, eva, petrol2]) await telefoon.context.close();
});

test("nepteams antwoorden vanzelf in de proef", async ({ page: admin }) => {
  test.setTimeout(120_000);
  await adminInDeProef(admin);
  await zetProefKlaar(admin);
  await admin.goto("/beheer/quiz/console");
  await console_(admin, "Start de quiz");
  await admin.getByRole("switch", { name: /Nepteams antwoorden\svanzelf/ }).click();
  await console_(admin, "Toon vraag 1");
  await expect(admin.getByText(/4 van 4 teams hebben\sgeantwoord/)).toBeVisible({ timeout: 30_000 });
});
