import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { enterFamilyCode, loggedIn, resetState } from "./helpers";

test.beforeEach(async () => {
  await resetState();
});

test("zonder familiecode kom je bij het welkomstscherm, ook via een diepe link", async ({ page }) => {
  await page.goto("/programma");
  await expect(page).toHaveURL(/\/welkom\?terug=%2Fprogramma$/);
  await expect(page.getByRole("heading", { name: "Kom binnen" })).toBeVisible();
  // Nothing about the place or the date before the code.
  await expect(page.getByText("Borkel en Schaft")).toHaveCount(0);

  await page.getByLabel("Familiecode").fill(E2E.familyCode.toLowerCase());
  await page.getByRole("button", { name: "Kom binnen" }).click();
  await expect(page).toHaveURL(/\/programma$/);
  await expect(page.getByRole("heading", { level: 1, name: "Programma" })).toBeVisible();
});

test("een verkeerde code geeft een duidelijke melding en je typwerk blijft staan", async ({ page }) => {
  await enterFamilyCode(page, "VERKEERD1");
  await expect(page.getByText("Die code klopt niet")).toBeVisible();
  await expect(page.getByLabel("Familiecode")).toHaveValue("VERKEERD1");
  await expect(page).toHaveURL(/\/welkom/);
});

test("de code werkt met spaties, streepjes en kleine letters", async ({ page }) => {
  await enterFamilyCode(page, " spelen-2027 ");
  await expect(page).toHaveURL(/\/$/);
});

test("na te veel verkeerde codes moet je even wachten", async ({ page }) => {
  for (let i = 0; i < 20; i += 1) {
    await enterFamilyCode(page, `FOUT${1000 + i}`);
    await expect(page.getByText("Die code klopt niet")).toBeVisible();
  }
  await enterFamilyCode(page, E2E.familyCode);
  await expect(page.getByText(/Te vaak een verkeerde code geprobeerd\. Probeer het om \d{2}:\d{2} opnieuw\./)).toBeVisible();
  await expect(page).toHaveURL(/\/welkom/);
});

test("de sessie is een httpOnly-cookie van 120 dagen en blijft na herladen", async ({ page, context }) => {
  await loggedIn(page);
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "valk_sessie");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  const days = ((session?.expires ?? 0) * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(119);
  expect(days).toBeLessThanOrEqual(120);
  expect(cookies.find((c) => c.name === "valk_toestel")?.httpOnly).toBe(true);

  await page.reload();
  await expect(page).toHaveURL(/\/$/);
});

test("met een vervalste cookie kom je er niet in", async ({ page, context }) => {
  await context.addCookies([{ name: "valk_sessie", value: "eyJhbGciOiJIUzI1NiJ9.e30.vals", url: "http://localhost:3100" }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/welkom/);
});

test("wie al binnen is en naar het welkomstscherm gaat, komt thuis", async ({ page }) => {
  await loggedIn(page);
  await page.goto("/welkom");
  await expect(page).toHaveURL(/\/$/);
});

test("de API zegt netjes dat je eerst de code moet invullen", async ({ request }) => {
  const response = await request.get("/api/iets");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ fout: "Vul eerst de familiecode in." });
});
