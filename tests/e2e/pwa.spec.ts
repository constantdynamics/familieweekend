import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { db, loggedIn, resetState } from "./helpers";

test.beforeEach(async () => {
  await resetState();
});

test("het manifest klopt met de SPEC", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "De Valkenburger Spelen 2027",
    short_name: "Valk Spelen",
    theme_color: "#2B1810",
    orientation: "portrait",
    display: "standalone",
    start_url: "/",
  });
  const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose);
  expect(purposes).toContain("maskable");
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()["content-type"]).toBe("image/png");
  }
  const apple = await request.get("/apple-touch-icon.png");
  expect(apple.ok()).toBe(true);
});

test("iOS krijgt splashscreens en een apple-touch-icon", async ({ page }) => {
  await page.goto("/welkom");
  const startup = page.locator('link[rel="apple-touch-startup-image"]');
  expect(await startup.count()).toBeGreaterThanOrEqual(20);
  const href = await startup.first().getAttribute("href");
  const file = await page.request.get(href!);
  expect(file.ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#2B1810");
});

test("de service worker neemt de app over en vangt offline af", async ({ page, context }) => {
  await loggedIn(page);
  // Installing means precaching every static file; on a busy machine that takes a while.
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration?.active);
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Once more through the service worker, so Thuis lands in its page cache.
  await page.reload();
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match("/"))), { timeout: 15_000 }).toBe(true);

  await context.setOffline(true);
  // A page seen before comes from the cache, with the offline banner.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: /De Valkenburger\s*Spelen/ })).toBeVisible();
  await expect(page.getByText(/Je bent offline/)).toBeVisible();
  // A page never seen shows the offline page.
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Geen verbinding" })).toBeVisible();
  await context.setOffline(false);
});

test("de service worker cachet geen beheer en geen API", async ({ page }) => {
  await loggedIn(page);
  await page.goto("/beheer");
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active), undefined, {
    timeout: 30_000,
  });
  await page.goto("/beheer");
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(cached.some((url) => url.startsWith("/beheer"))).toBe(false);
  expect(cached.some((url) => url.startsWith("/api/"))).toBe(false);
  expect(cached).toContain("/offline");
});

test.describe("keepalive", () => {
  test("weigert zonder geheim en schrijft een hartslag met geheim", async ({ request }) => {
    expect((await request.get("/api/keepalive")).status()).toBe(401);
    expect((await request.get("/api/keepalive", { headers: { authorization: "Bearer fout" } })).status()).toBe(401);
    const response = await request.get("/api/keepalive", {
      headers: { authorization: `Bearer ${E2E.cronSecret}`, "user-agent": "vercel-cron/1.0" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.beats).toBeGreaterThan(0);
    const sql = db();
    const [row] = await sql`select source from valk.heartbeat`;
    await sql.end();
    expect(row.source).toBe("vercel-cron");
  });

  test("de gezondheidscheck is openbaar en verklapt niets", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["database", "ms", "ok"]);
  });
});
