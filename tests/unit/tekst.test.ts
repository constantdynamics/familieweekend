import { describe, expect, it } from "vitest";
import { bijElkaar } from "@/lib/shared/tekst";

describe("bijElkaar", () => {
  it("houdt een korte plaatsnaam op één regel", () => {
    expect(bijElkaar("Borkel en Schaft")).toBe("Borkel en Schaft");
    expect(bijElkaar("  Borkel   en Schaft ")).toBe("Borkel en Schaft");
  });

  it("houdt bij een lange tekst alleen de laatste twee woorden bij elkaar", () => {
    expect(bijElkaar("Recreatiepark De Achterste Hoef in Bergeijk")).toBe(
      "Recreatiepark De Achterste Hoef in Bergeijk",
    );
  });

  it("laat één woord en lege tekst zoals ze zijn", () => {
    expect(bijElkaar("Valkenswaard")).toBe("Valkenswaard");
    expect(bijElkaar("")).toBe("");
  });
});
