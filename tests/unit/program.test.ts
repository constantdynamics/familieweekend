import { describe, expect, it } from "vitest";
import {
  currentItem,
  dayKey,
  defaultDay,
  describeDay,
  formatLongDay,
  itemDetails,
  itemEnd,
  itemState,
  itemsOnDay,
  nextItems,
  parseProgramForm,
  programDays,
  progressFraction,
  relativeDay,
  remainingText,
  sortProgram,
  weekendDayNumber,
  whenText,
  type ProgramFormValues,
} from "@/lib/shared/program";
import { at, END, item, START, VOORBEELD } from "../support/voorbeeldprogramma";

const ZATERDAG_1142 = Date.parse(at(8, 11, 42));

describe("dagen van het programma", () => {
  it("rekent de dag in Amsterdamse tijd, ook rond middernacht", () => {
    expect(dayKey("2027-05-06T21:59:00Z")).toBe("2027-05-06");
    expect(dayKey("2027-05-06T22:30:00Z")).toBe("2027-05-07");
    expect(dayKey("2026-11-20T23:30:00Z")).toBe("2026-11-21");
  });

  it("maakt tabs voor do, vr, za en zo", () => {
    const days = programDays(VOORBEELD, START, END);
    expect(days.map((d) => d.short)).toEqual(["Do", "Vr", "Za", "Zo"]);
    expect(days[0]).toMatchObject({ key: "2027-05-06", date: "6 mei", weekday: "donderdag", long: "Donderdag 6 mei" });
  });

  it("voegt een dag toe als er een onderdeel buiten het weekend staat", () => {
    const extra = [...VOORBEELD, item(5, 20, 0, "Vooravond")];
    expect(programDays(extra, START, END).map((d) => d.short)).toEqual(["Wo", "Do", "Vr", "Za", "Zo"]);
  });

  it("opent geen nieuwe dag voor een einde om precies middernacht", () => {
    expect(programDays([], START, at(10, 0)).map((d) => d.key)).toEqual(["2027-05-06", "2027-05-07", "2027-05-08", "2027-05-09"]);
  });

  it("opent vandaag, en anders de eerste dag", () => {
    const days = programDays(VOORBEELD, START, END);
    expect(defaultDay(days, ZATERDAG_1142)).toBe("2027-05-08");
    expect(defaultDay(days, Date.parse("2026-11-20T13:20:00Z"))).toBe("2027-05-06");
    expect(defaultDay([], ZATERDAG_1142)).toBeNull();
  });

  it("schrijft de dag voluit als titel", () => {
    expect(formatLongDay(ZATERDAG_1142)).toBe("Zaterdag 8 mei");
    expect(describeDay("2027-05-09").short).toBe("Zo");
  });

  it("telt de dagen van de Spelen vanaf de aftrap", () => {
    expect(weekendDayNumber(Date.parse(at(6, 14, 0)), START)).toBe(1);
    expect(weekendDayNumber(ZATERDAG_1142, START)).toBe(3);
    expect(weekendDayNumber(Date.parse(at(9, 9, 0)), START)).toBe(4);
  });
});

describe("nu en straks", () => {
  it("laat een onderdeel duren tot het volgende begint", () => {
    const zeskamp = VOORBEELD[9];
    expect(itemEnd(zeskamp, VOORBEELD)).toEqual({ end: Date.parse(at(8, 12, 30)), known: true });
  });

  it("neemt een eigen eindtijd over", () => {
    const party = item(8, 21, 30, "Kampvuur", "gewoon", { endsAt: at(8, 23, 0) });
    expect(itemEnd(party, [...VOORBEELD, party])).toEqual({ end: Date.parse(at(8, 23, 0)), known: true });
  });

  it("laat het laatste onderdeel van de dag tot middernacht lopen, zonder resterende tijd", () => {
    const uitslag = VOORBEELD[3];
    expect(itemEnd(uitslag, VOORBEELD)).toEqual({ end: Date.parse(at(7, 0, 0)), known: false });
    expect(itemState(uitslag, VOORBEELD, Date.parse(at(6, 23, 30)))).toBe("nu");
    expect(itemState(uitslag, VOORBEELD, Date.parse(at(7, 0, 30)))).toBe("voorbij");
  });

  it("weet wat er zaterdag om 11:42 bezig is en wat er straks komt", () => {
    expect(currentItem(VOORBEELD, ZATERDAG_1142)?.title).toBe("Zeskamp, spel 1 t/m 3");
    expect(nextItems(VOORBEELD, ZATERDAG_1142).map((i) => i.title)).toEqual(["Lunch", "Zeskamp, spel 4 t/m 6"]);
    expect(itemState(VOORBEELD[8], VOORBEELD, ZATERDAG_1142)).toBe("voorbij");
    expect(itemState(VOORBEELD[12], VOORBEELD, ZATERDAG_1142)).toBe("straks");
  });

  it("kiest het onderdeel dat het laatst begon als er twee tegelijk lopen", () => {
    const lang = item(8, 10, 0, "Zeskamp de hele dag", "zeskamp", { endsAt: at(8, 17, 0) });
    expect(currentItem([...VOORBEELD, lang], Date.parse(at(8, 13, 0)))?.title).toBe("Lunch");
  });

  it("heeft 's nachts niets bezig", () => {
    expect(currentItem(VOORBEELD, Date.parse(at(7, 2, 0)))).toBeNull();
    expect(nextItems(VOORBEELD, Date.parse(at(7, 2, 0)), 1)[0].title).toBe("Ontbijt");
  });

  it("zegt hoe lang het nog duurt", () => {
    expect(remainingText(48 * 60000)).toBe("nog 48 minuten");
    expect(remainingText(60000)).toBe("nog 1 minuut");
    expect(remainingText(20000)).toBe("nog 1 minuut");
    expect(remainingText(65 * 60000)).toBe("nog 1 uur en 5 minuten");
    expect(remainingText(61 * 60000)).toBe("nog 1 uur en 1 minuut");
    expect(remainingText(120 * 60000)).toBe("nog 2 uur");
  });

  it("rekent de voortgang tussen 0 en 1", () => {
    expect(progressFraction(0, 100, 25)).toBe(0.25);
    expect(progressFraction(0, 100, -5)).toBe(0);
    expect(progressFraction(0, 100, 500)).toBe(1);
    expect(progressFraction(10, 10, 10)).toBe(1);
  });

  it("noemt de dag van een onderdeel vanaf nu gezien", () => {
    expect(relativeDay(Date.parse(at(8, 20, 30)), ZATERDAG_1142)).toBe("vandaag");
    expect(relativeDay(Date.parse(at(9, 9, 0)), ZATERDAG_1142)).toBe("morgen");
    expect(relativeDay(Date.parse(at(7, 9, 0)), ZATERDAG_1142)).toBe("gisteren");
    expect(relativeDay(Date.parse(at(6, 20, 0)), ZATERDAG_1142)).toBe("donderdag");
    expect(whenText(Date.parse(at(8, 20, 30)), ZATERDAG_1142)).toBe("vanavond om 20:30");
    expect(whenText(Date.parse(at(8, 14, 0)), ZATERDAG_1142)).toBe("vandaag om 14:00");
    expect(whenText(Date.parse(at(9, 9, 0)), ZATERDAG_1142)).toBe("morgen om 09:00");
  });

  it("zet plek en ondertitel achter elkaar", () => {
    expect(itemDetails(VOORBEELD[9])).toBe("Op het grasveld · Het scorebord gaat op slot");
    expect(itemDetails(VOORBEELD[0])).toBeNull();
  });

  it("sorteert op tijd en daarna op de volgorde van de beheerder", () => {
    const a = item(8, 15, 0, "B later", "gewoon", { sort: 2 });
    const b = item(8, 15, 0, "A eerder", "gewoon", { sort: 1 });
    expect(sortProgram([a, b, VOORBEELD[0]]).map((i) => i.title)).toEqual(["Aankomst en kamers verdelen", "A eerder", "B later"]);
    expect(itemsOnDay(VOORBEELD, "2027-05-09").map((i) => i.title)).toEqual(["Moederdagontbijt", "Opruimen", "Vertrek"]);
  });
});

describe("het formulier van de beheerder", () => {
  const goed: ProgramFormValues = {
    dag: "2027-05-08",
    begin: "21:30",
    eind: "23:00",
    titel: "  Kampvuur   met marshmallows ",
    ondertitel: "",
    plek: "Bij de vijver",
    soort: "gewoon",
  };

  it("leest een goed ingevuld onderdeel", () => {
    const result = parseProgramForm(goed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toEqual({
      startsAt: new Date(at(8, 21, 30)),
      endsAt: new Date(at(8, 23, 0)),
      title: "Kampvuur met marshmallows",
      subtitle: null,
      location: "Bij de vijver",
      kind: "gewoon",
    });
  });

  it("laat het einde leeg als dat mag", () => {
    const result = parseProgramForm({ ...goed, eind: "" });
    expect(result.ok && result.input.endsAt).toBeNull();
  });

  it("leest een eindtijd na middernacht als de volgende nacht", () => {
    const result = parseProgramForm({ ...goed, begin: "22:30", eind: "01:00" });
    expect(result.ok && result.input.endsAt?.toISOString()).toBe(at(9, 1, 0));
  });

  it("weigert een einde voor of gelijk aan het begin", () => {
    expect(parseProgramForm({ ...goed, begin: "14:00", eind: "13:00" })).toEqual({
      ok: false,
      velden: { eind: "Het einde moet na het begin liggen." },
    });
    expect(parseProgramForm({ ...goed, begin: "14:00", eind: "14:00" }).ok).toBe(false);
  });

  it("zegt per veld wat er mis is", () => {
    const result = parseProgramForm({ dag: "morgen", begin: "", eind: "", titel: " ", ondertitel: "x".repeat(121), plek: "", soort: "feest" });
    expect(result).toEqual({
      ok: false,
      velden: {
        dag: "Kies een dag.",
        titel: "Geef het onderdeel een titel.",
        ondertitel: "Houd de ondertitel korter dan 120 tekens.",
        soort: "Kies een soort.",
      },
    });
    expect(parseProgramForm({ ...goed, begin: "25:00" })).toMatchObject({ ok: false, velden: { begin: expect.any(String) } });
    expect(parseProgramForm({ ...goed, titel: "x".repeat(81) })).toMatchObject({ ok: false, velden: { titel: expect.any(String) } });
  });
});
