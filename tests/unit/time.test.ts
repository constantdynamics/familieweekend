import { describe, expect, it } from "vitest";
import {
  amsterdamOffsetMinutes,
  amsterdamParts,
  formatDateRange,
  formatDateRangePlain,
  formatDayAndTime,
  formatDayMonth,
  formatTime,
  fromAmsterdamWallTime,
  parseAmsterdamInput,
  toAmsterdamInput,
} from "@/lib/shared/time";

describe("Amsterdamse tijd", () => {
  it("kent zomertijd en wintertijd", () => {
    expect(amsterdamOffsetMinutes(new Date("2027-05-06T12:00:00Z"))).toBe(120);
    expect(amsterdamOffsetMinutes(new Date("2026-12-01T12:00:00Z"))).toBe(60);
  });

  it("zet de aftrap om naar het juiste moment", () => {
    const kickOff = fromAmsterdamWallTime(2027, 5, 6, 14, 0);
    expect(kickOff.toISOString()).toBe("2027-05-06T12:00:00.000Z");
    expect(amsterdamParts(kickOff)).toMatchObject({ year: 2027, month: 5, day: 6, hour: 14, minute: 0 });
  });

  it("gaat goed rond de klokwissels", () => {
    // 28 maart 2027: om 02:00 gaat de klok naar 03:00.
    expect(fromAmsterdamWallTime(2027, 3, 28, 1, 30).toISOString()).toBe("2027-03-28T00:30:00.000Z");
    expect(fromAmsterdamWallTime(2027, 3, 28, 3, 30).toISOString()).toBe("2027-03-28T01:30:00.000Z");
    // 02:30 bestaat niet en wordt 03:30 zomertijd.
    expect(fromAmsterdamWallTime(2027, 3, 28, 2, 30).toISOString()).toBe("2027-03-28T01:30:00.000Z");
    // 31 oktober 2027: om 03:00 gaat de klok terug naar 02:00.
    expect(fromAmsterdamWallTime(2027, 10, 31, 12, 0).toISOString()).toBe("2027-10-31T11:00:00.000Z");
  });

  it("leest formulierwaarden en weigert onzin", () => {
    expect(parseAmsterdamInput("2027-04-01", "23:59")?.toISOString()).toBe("2027-04-01T21:59:00.000Z");
    expect(parseAmsterdamInput("2027-02-31", "12:00")).toBeNull();
    expect(parseAmsterdamInput("2027-13-01", "12:00")).toBeNull();
    expect(parseAmsterdamInput("2027-05-06", "25:00")).toBeNull();
    expect(parseAmsterdamInput("", "")).toBeNull();
    expect(toAmsterdamInput(new Date("2027-05-06T12:00:00Z"))).toEqual({ date: "2027-05-06", time: "14:00" });
  });

  it("schrijft datums zoals in het ontwerp", () => {
    const start = new Date("2027-05-06T12:00:00Z");
    const end = new Date("2027-05-09T13:00:00Z");
    expect(formatDateRange(start, end)).toBe("do\u00a06 t/m zo\u00a09\u00a0mei");
    expect(formatDateRangePlain(start, end)).toBe("6 t/m 9 mei 2027");
    expect(formatDayAndTime(start)).toBe("donderdag\u00a06\u00a0mei,\u00a014:00");
    expect(formatTime(new Date("2027-05-08T09:42:00Z"))).toBe("11:42");
    expect(formatDayMonth(new Date("2027-04-01T21:59:00Z"))).toBe("1\u00a0april");
  });

  it("houdt een datum en tijd bij elkaar op één regel", () => {
    const start = new Date("2027-05-06T12:00:00Z");
    // Only "t/m" may start a new line; a date never falls apart.
    expect(formatDateRange(start, new Date("2027-05-09T13:00:00Z")).split(" ")).toEqual(["do\u00a06", "t/m", "zo\u00a09\u00a0mei"]);
    expect(formatDayAndTime(start)).not.toContain(" ");
  });

  it("noemt de maand twee keer als het weekend over een maandgrens gaat", () => {
    expect(formatDateRange(new Date("2027-04-29T12:00:00Z"), new Date("2027-05-02T12:00:00Z"))).toBe(
      "do\u00a029\u00a0apr t/m zo\u00a02\u00a0mei",
    );
  });
});
