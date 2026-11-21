import { describe, expect, it } from "vitest";
import {
  aggregateFor,
  answerText,
  conceptQuestion,
  csvCell,
  doneCounterText,
  fileSlug,
  funfactsPhase,
  numberOptions,
  optionRenames,
  parseOptions,
  parseValue,
  questionStats,
  sameAnswer,
  splitIntoParts,
  toCsv,
  type AnswerShape,
  type QuestionShape,
} from "@/lib/shared/funfacts";

const id = "5f0c6a0e-8a3b-4c1d-9e2f-0123456789ab";

function vraag(partial: Partial<QuestionShape>): QuestionShape {
  return { id, kind: "ja_nee", text: "Heb je ooit iets gebroken?", options: null, min: null, max: null, quizForm: null, ...partial };
}

const ja = (n: number): AnswerShape[] => Array.from({ length: n }, () => ({ value: { bool: true }, skipped: false }));
const nee = (n: number): AnswerShape[] => Array.from({ length: n }, () => ({ value: { bool: false }, skipped: false }));
const getallen = (...n: number[]): AnswerShape[] => n.map((x) => ({ value: { number: x }, skipped: false }));
const keuzes = (...c: string[]): AnswerShape[] => c.map((x) => ({ value: { choice: x }, skipped: false }));
const overgeslagen = (n: number): AnswerShape[] => Array.from({ length: n }, () => ({ value: null, skipped: true }));

describe("een antwoord controleren", () => {
  it("houdt alleen de verwachte sleutel over", () => {
    expect(parseValue(vraag({}), { bool: true, stiekem: "x" })).toEqual({ ok: true, value: { bool: true } });
    expect(parseValue(vraag({}), { bool: "ja" })).toMatchObject({ ok: false });
    expect(parseValue(vraag({}), null)).toMatchObject({ ok: false });
    expect(parseValue(vraag({}), [true])).toMatchObject({ ok: false });
  });

  it("houdt een getal binnen het minimum en maximum, en alleen hele getallen", () => {
    const q = vraag({ kind: "getal", min: 0, max: 200 });
    expect(parseValue(q, { number: 0 })).toEqual({ ok: true, value: { number: 0 } });
    expect(parseValue(q, { number: 200 })).toEqual({ ok: true, value: { number: 200 } });
    expect(parseValue(q, { number: 201 })).toEqual({ ok: false, fout: "Kies een getal van 0 tot 200." });
    expect(parseValue(q, { number: -1 })).toMatchObject({ ok: false });
    expect(parseValue(q, { number: 2.5 })).toMatchObject({ ok: false });
    expect(parseValue(q, { number: "12" })).toMatchObject({ ok: false });
    expect(parseValue(vraag({ kind: "getal", min: 0, max: 20000 }), { number: 30000 })).toEqual({
      ok: false,
      fout: "Kies een getal van 0 tot 20.000.",
    });
  });

  it("accepteert bij een keuze alleen een van de opties", () => {
    const q = vraag({ kind: "keuze", options: ["Koffie", "Thee"] });
    expect(parseValue(q, { choice: "Thee" })).toEqual({ ok: true, value: { choice: "Thee" } });
    expect(parseValue(q, { choice: "thee" })).toMatchObject({ ok: false });
    expect(parseValue(q, { choice: "Bier" })).toMatchObject({ ok: false });
  });

  it("maakt open tekst schoon en begrenst de lengte", () => {
    const q = vraag({ kind: "open" });
    expect(parseValue(q, { text: "  Dancing Queen\r\nABBA \u0007" })).toEqual({ ok: true, value: { text: "Dancing Queen\nABBA" } });
    expect(parseValue(q, { text: "   " })).toMatchObject({ ok: false });
    expect(parseValue(q, { text: "x".repeat(1001) })).toMatchObject({ ok: false });
    expect(parseValue(q, { text: "x".repeat(1000) })).toMatchObject({ ok: true });
  });

  it("wil bij een foto een echte upload-id", () => {
    const q = vraag({ kind: "foto" });
    expect(parseValue(q, { upload: id.toUpperCase() })).toEqual({ ok: true, value: { upload: id } });
    expect(parseValue(q, { upload: "../geheim" })).toMatchObject({ ok: false });
  });

  it("ziet wanneer opnieuw bewaren niet nodig is", () => {
    expect(sameAnswer({ value: { bool: true }, skipped: false }, { value: { bool: true }, skipped: false })).toBe(true);
    expect(sameAnswer({ value: { bool: true }, skipped: false }, { value: null, skipped: true })).toBe(false);
    expect(sameAnswer(undefined, { value: null, skipped: true })).toBe(false);
  });
});

describe("een antwoord laten zien", () => {
  it("zegt het in gewone woorden", () => {
    expect(answerText(vraag({}), { value: { bool: true }, skipped: false })).toBe("Ja");
    expect(answerText(vraag({ kind: "getal" }), { value: { number: 20000 }, skipped: false })).toBe("20.000");
    expect(answerText(vraag({}), { value: null, skipped: true })).toBe("Overgeslagen");
    expect(answerText(vraag({}), undefined)).toBe("Nog niet ingevuld");
    expect(answerText(vraag({ kind: "foto" }), { value: { upload: id }, skipped: false })).toBe("Foto");
  });
});

describe("wanneer de lijst open is", () => {
  const open = "2027-01-01T00:00:00+01:00";
  const deadline = "2027-04-01T23:59:59+02:00";
  it("gaat open op de openingstijd en sluit na de deadline (servertijd)", () => {
    expect(funfactsPhase(open, deadline, Date.parse("2026-12-31T23:59:59+01:00"))).toBe("voor");
    expect(funfactsPhase(open, deadline, Date.parse(open))).toBe("open");
    expect(funfactsPhase(open, deadline, Date.parse(deadline))).toBe("open");
    expect(funfactsPhase(open, deadline, Date.parse(deadline) + 1000)).toBe("dicht");
  });

  it("telt wie er klaar is", () => {
    expect(doneCounterText(32, 45)).toBe("32 van de 45 familieleden zijn klaar");
    expect(doneCounterText(1, 45)).toBe("1 van de 45 familieleden is klaar");
    expect(doneCounterText(0, 45)).toBe("Nog niemand is klaar. Wie is de eerste?");
    expect(doneCounterText(45, 45)).toBe("Alle 45 familieleden zijn klaar!");
    expect(doneCounterText(0, 0)).toBe("");
  });
});

describe("vragen bewerken", () => {
  it("leest opties, één per regel, zonder lege regels en dubbelingen", () => {
    expect(parseOptions(" Koffie \n\nThee\nkoffie\nAllebei  \n")).toEqual(["Koffie", "Thee", "Allebei"]);
  });

  it("neemt antwoorden mee bij een hernoemde optie, niet bij een nieuwe volgorde", () => {
    expect([...optionRenames(["Koffie", "Thee"], ["Koffie", "Thee met honing"])]).toEqual([["Thee", "Thee met honing"]]);
    expect([...optionRenames(["Koffie", "Thee"], ["Thee", "Koffie"])]).toEqual([]);
    expect([...optionRenames(["Koffie", "Thee"], ["Koffie", "Thee", "Water"])]).toEqual([]);
  });
});

describe("statistieken per vraag", () => {
  it("telt ja en nee met percentages, overgeslagen apart", () => {
    const stats = questionStats(vraag({}), [...ja(17), ...nee(28), ...overgeslagen(3)]);
    expect(stats.answered).toBe(45);
    expect(stats.skipped).toBe(3);
    expect(stats.rows.map((r) => [r.label, r.count, Math.round(r.percent)])).toEqual([
      ["Ja", 17, 38],
      ["Nee", 28, 62],
    ]);
  });

  it("geeft per optie het aantal, ook voor een oude optie", () => {
    const q = vraag({ kind: "keuze", options: ["Koffie", "Thee", "Allebei"] });
    const stats = questionStats(q, keuzes("Koffie", "Koffie", "Thee", "Cola"));
    expect(stats.rows).toEqual([
      { label: "Koffie", count: 2, percent: 50 },
      { label: "Thee", count: 1, percent: 25 },
      { label: "Allebei", count: 0, percent: 0 },
      { label: "Cola", count: 1, percent: 25, outdated: true },
    ]);
  });

  it("geeft bij getallen het gemiddelde, de hoogste, de laagste en de som", () => {
    const stats = questionStats(vraag({ kind: "getal", min: 0, max: 200 }), [...getallen(4, 12, 54, 3), ...overgeslagen(1)]);
    expect(stats.numbers).toEqual({ n: 4, average: 18.25, min: 3, max: 54, sum: 73 });
  });
});

describe("conceptvragen voor de quiz", () => {
  it("maakt van ja/nee een telvraag met het echte aantal en drie afleiders", () => {
    const q = vraag({ quizForm: "Hoeveel van ons hebben ooit iets gebroken?" });
    const result = conceptQuestion(q, [...ja(17), ...nee(28)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { draft } = result;
    expect(draft.text).toBe("Hoeveel van ons hebben ooit iets gebroken?");
    expect(draft.options).toHaveLength(4);
    expect(draft.options[draft.correct]).toBe("17");
    const numbers = draft.options.map(Number);
    expect(new Set(numbers).size).toBe(4);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    expect(numbers.every((n) => n >= 0 && n <= 45)).toBe(true);
    expect(draft.explanation).toBe("17 van de 45 familieleden zeiden ja op de vraag: Heb je ooit iets gebroken?");
  });

  it("zet het goede antwoord niet altijd op dezelfde plek", () => {
    const q = vraag({ quizForm: "Hoeveel van ons hebben ooit iets gebroken?" });
    const plekken = new Set(
      [0, 1, 2, 3].map((seed) => {
        const result = conceptQuestion(q, [...ja(17), ...nee(28)], seed);
        return result.ok ? result.draft.correct : -1;
      }),
    );
    expect(plekken.size).toBe(4);
  });

  it("vraagt om een percentage als de quizvorm dat zegt", () => {
    const q = vraag({ text: "Ben je bang voor spinnen?", quizForm: "Welk percentage van ons is bang voor spinnen?" });
    const result = conceptQuestion(q, [...ja(9), ...nee(21)]);
    expect(result.ok && result.draft.options[result.draft.correct]).toBe("30%");
    expect(result.ok && result.draft.options.every((o) => /^\d+%$/.test(o))).toBe(true);
  });

  it("leest uit de quizvorm welk getal gevraagd wordt", () => {
    expect(aggregateFor("Wat is het record van de familie?")).toBe("hoogste");
    expect(aggregateFor("Hoeveel uur slaapt de familie gemiddeld?")).toBe("gemiddelde");
    expect(aggregateFor("Hoeveel paar schoenen hebben we samen?")).toBe("som");
    expect(aggregateFor("Wie woont het minste ver weg?")).toBe("laagste");

    const landen = vraag({ kind: "getal", min: 0, max: 200, quizForm: "Wat is het record van de familie?" });
    const record = conceptQuestion(landen, getallen(4, 12, 54, 3));
    expect(record.ok && record.draft.options[record.draft.correct]).toBe("54");

    const slaap = vraag({ kind: "getal", min: 3, max: 14, quizForm: "Hoeveel uur slaapt de familie gemiddeld?" });
    const gemiddeld = conceptQuestion(slaap, getallen(7, 8, 8, 6));
    expect(gemiddeld.ok && gemiddeld.draft.options[gemiddeld.draft.correct]).toBe("7,3");
    expect(gemiddeld.ok && gemiddeld.draft.explanation).toBe("Gemiddeld 7,3, van 4 familieleden die dit invulden.");

    const schoenen = vraag({ kind: "getal", min: 0, max: 200, quizForm: "Hoeveel paar schoenen hebben we samen?" });
    const samen = conceptQuestion(schoenen, getallen(12, 30, 8));
    expect(samen.ok && samen.draft.options[samen.draft.correct]).toBe("50");
  });

  it("laat bij een keuze de winnaar raden, en waarschuwt bij gelijkspel", () => {
    const seizoen = vraag({ kind: "keuze", options: ["Lente", "Zomer", "Herfst", "Winter"], quizForm: "Wat is het favoriete seizoen van de familie?" });
    const winst = conceptQuestion(seizoen, keuzes("Zomer", "Zomer", "Lente", "Herfst"));
    expect(winst.ok && winst.draft.options).toEqual(["Lente", "Zomer", "Herfst", "Winter"]);
    expect(winst.ok && winst.draft.options[winst.draft.correct]).toBe("Zomer");
    expect(winst.ok && winst.draft.note).toBeUndefined();

    const gelijk = conceptQuestion(seizoen, keuzes("Zomer", "Lente"));
    expect(gelijk.ok && gelijk.draft.note).toMatch(/^Gelijkspel: Lente en Zomer/);

    const hagel = vraag({ kind: "keuze", options: ["Puur", "Melk", "Wit", "Gemengd", "Geen hagelslag"], quizForm: "Welke hagelslag wint?" });
    const top = conceptQuestion(hagel, keuzes("Melk", "Melk", "Puur", "Wit", "Geen hagelslag", "Geen hagelslag"));
    expect(top.ok && top.draft.options).toHaveLength(4);
    expect(top.ok && top.draft.options.includes("Gemengd")).toBe(false);
  });

  it("telt de genoemde optie bij een percentage- of hoeveelvraag", () => {
    const koffie = vraag({ kind: "keuze", options: ["Koffie", "Thee", "Allebei", "Geen van beide"], quizForm: "Welk percentage kiest koffie?" });
    const pct = conceptQuestion(koffie, keuzes("Koffie", "Thee", "Thee", "Allebei"));
    expect(pct.ok && pct.draft.options[pct.draft.correct]).toBe("25%");

    const rijexamen = vraag({
      kind: "keuze",
      text: "Ben je ooit gezakt voor je rijexamen?",
      options: ["Ja", "Nee, in één keer geslaagd", "Ik heb (nog) geen rijbewijs"],
      quizForm: "Hoeveel van ons zakten ooit voor het rijexamen?",
    });
    const zakkers = conceptQuestion(rijexamen, keuzes("Ja", "Ja", "Nee, in één keer geslaagd", "Ja"));
    expect(zakkers.ok && zakkers.draft.options[zakkers.draft.correct]).toBe("3");
  });

  it("maakt geen concept bij open vragen, foto's of zonder antwoorden", () => {
    expect(conceptQuestion(vraag({ kind: "open" }), [{ value: { text: "x" }, skipped: false }]).ok).toBe(false);
    expect(conceptQuestion(vraag({ kind: "foto" }), []).ok).toBe(false);
    expect(conceptQuestion(vraag({}), overgeslagen(4))).toEqual({ ok: false, reason: "Nog geen antwoorden." });
  });

  it("werkt ook met heel weinig antwoorden", () => {
    const result = conceptQuestion(vraag({}), ja(1));
    expect(result.ok && result.draft.options).toEqual(["0", "1"]);
  });
});

describe("afleiders bij getallen", () => {
  it("blijven binnen het bereik, zijn uniek en bevatten het echte getal", () => {
    for (const value of [0, 1, 3, 17, 45, 99, 281, 12345]) {
      for (let seed = 0; seed < 4; seed += 1) {
        const options = numberOptions(value, { low: 0, high: Math.max(value * 3, 10), decimals: 0 }, seed);
        expect(options).toContain(value);
        expect(new Set(options).size).toBe(options.length);
        expect(options.every((o) => o >= 0)).toBe(true);
      }
    }
    expect(numberOptions(0, { low: 0, high: 45, decimals: 0 }, 0)).toEqual([0, 1, 2, 3]);
  });
});

describe("export", () => {
  it("zet aanhalingstekens waar nodig en laat geen formules door", () => {
    expect(csvCell("Koffie")).toBe("Koffie");
    expect(csvCell("Ja; zeker")).toBe('"Ja; zeker"');
    expect(csvCell('Hij zei "hoi"')).toBe('"Hij zei ""hoi"""');
    expect(csvCell("regel\nnog een")).toBe('"regel\nnog een"');
    expect(csvCell("=SOM(A1:A3)")).toBe("'=SOM(A1:A3)");
    expect(csvCell("-12")).toBe("-12");
    expect(csvCell(null)).toBe("");
  });

  it("maakt een CSV met puntkomma's, een BOM en Windows-regeleinden", () => {
    expect(toCsv([["Naam", "Klaar"], ["Oma Riët", "ja"]])).toBe("﻿Naam;Klaar\r\nOma Riët;ja\r\n");
  });

  it("maakt nette bestandsnamen", () => {
    expect(fileSlug("Oma Riët van 't Hof")).toBe("oma-riet-van-t-hof");
    expect(fileSlug("???")).toBe("foto");
  });

  it("verdeelt foto's over delen die klein genoeg blijven", () => {
    const files = [3, 2, 2, 5, 1].map((size, i) => ({ id: String(i), size }));
    expect(splitIntoParts(files, 4).map((part) => part.map((f) => f.id))).toEqual([["0"], ["1", "2"], ["3"], ["4"]]);
    expect(splitIntoParts([], 4)).toEqual([]);
  });
});
