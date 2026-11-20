import { describe, expect, it } from "vitest";
import { countdownParts, countdownSentence, twoDigits, weekendPhase } from "@/lib/shared/countdown";

const KICK_OFF = Date.parse("2027-05-06T12:00:00Z");

describe("aftelklok", () => {
  it("splitst de resterende tijd in dagen, uren, minuten en seconden", () => {
    const now = Date.parse("2026-11-20T13:20:15Z");
    const parts = countdownParts(KICK_OFF, now);
    expect(parts).toEqual({ days: 166, hours: 22, minutes: 39, seconds: 45, done: false });
  });

  it("rondt af naar boven, zodat 00:00:01 blijft staan tot het einde", () => {
    expect(countdownParts(KICK_OFF, KICK_OFF - 400)).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 1, done: false });
    expect(countdownParts(KICK_OFF, KICK_OFF)).toMatchObject({ seconds: 0, done: true });
    expect(countdownParts(KICK_OFF, KICK_OFF + 5000)).toMatchObject({ days: 0, done: true });
  });

  it("telt een dag van 23 uur rond de zomertijd gewoon in echte uren", () => {
    const parts = countdownParts(Date.parse("2027-03-29T00:00:00Z"), Date.parse("2027-03-27T00:00:00Z"));
    expect(parts).toMatchObject({ days: 2, hours: 0 });
  });

  it("maakt een zin voor schermlezers", () => {
    expect(countdownSentence({ days: 166, hours: 3, minutes: 12, seconds: 0, done: false })).toBe(
      "Nog 166 dagen, 3 uur en 12 minuten",
    );
    expect(countdownSentence({ days: 1, hours: 0, minutes: 1, seconds: 0, done: false })).toBe("Nog 1 dag en 1 minuut");
    expect(countdownSentence({ days: 0, hours: 0, minutes: 0, seconds: 30, done: false })).toBe("Nog 0 minuten");
    expect(countdownSentence({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true })).toBe("Het is zover!");
  });

  it("vult aan tot twee cijfers", () => {
    expect(twoDigits(3)).toBe("03");
    expect(twoDigits(42)).toBe("42");
  });

  it("weet of het weekend nog moet komen, bezig is of voorbij", () => {
    const end = Date.parse("2027-05-09T13:00:00Z");
    expect(weekendPhase(KICK_OFF - 1, KICK_OFF, end)).toBe("voor");
    expect(weekendPhase(KICK_OFF, KICK_OFF, end)).toBe("tijdens");
    expect(weekendPhase(end, KICK_OFF, end)).toBe("na");
  });
});
