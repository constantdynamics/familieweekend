/**
 * Generates every app icon, the iOS start screens and the share image from
 * one source: public/brand/embleem.svg (and the self-hosted fonts).
 *
 *   npm run icons
 *
 * When the real logo arrives, replace public/brand/embleem.svg (an emblem
 * without text, square viewBox) and run this again.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { SPLASH_SIZES, splashFileName } from "../src/lib/shared/splash";

const root = process.cwd();
const out = (...parts: string[]) => path.join(root, "public", ...parts);

const BROWN = "#2B1810";

async function fontFace(file: string, family: string, weight: string) {
  const data = (await readFile(path.join(root, "src", "app", "fonts", file))).toString("base64");
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};font-display:block}`;
}

async function render(
  browser: Browser,
  html: string,
  width: number,
  height: number,
  file: string,
  options: { scale?: number; transparent?: boolean } = {},
) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: options.scale ?? 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: options.transparent ?? false, type: "png" });
  await page.close();
}

async function main() {
  const svg = await readFile(out("brand", "embleem.svg"), "utf8");
  const emblemUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const fonts = (await fontFace("shrikhand-latin.woff2", "Shrikhand", "400")) + (await fontFace("rubik-latin-variable.woff2", "Rubik", "300 900"));

  await mkdir(out("icons"), { recursive: true });
  await mkdir(out("splash"), { recursive: true });

  const browser = await chromium.launch();
  try {
    // Square icons: emblem on chocolate brown. `fill` is the share of the
    // icon the emblem's viewBox takes; maskable keeps everything inside the
    // central 80 % safe zone.
    const square = (fill: number, radius = 0, background = BROWN) => `<!doctype html><html><body style="margin:0">
      <div style="width:100vw;height:100vh;background:${background};border-radius:${radius}%;display:flex;align-items:center;justify-content:center">
        <img src="${emblemUri}" style="width:${fill * 100}vw;height:${fill * 100}vw" />
      </div></body></html>`;

    const icons: [string, number, string, boolean?][] = [
      ["icons/icon-1024.png", 1024, square(0.84)],
      ["icons/icon-512.png", 512, square(0.84)],
      ["icons/icon-192.png", 192, square(0.86)],
      ["icons/maskable-512.png", 512, square(0.72)],
      ["icons/maskable-192.png", 192, square(0.72)],
      ["apple-touch-icon.png", 180, square(0.82)],
      ["icons/favicon-32.png", 32, square(0.98, 50, "transparent"), true],
      ["icons/favicon-48.png", 48, square(0.98, 50, "transparent"), true],
    ];
    for (const [file, size, html, transparent] of icons) {
      await render(browser, html, size, size, out(file), { transparent });
      console.log(`✓ ${file}`);
    }

    // iOS start screens: the emblem and the word mark on studio brown.
    for (const size of SPLASH_SIZES) {
      const emblem = Math.round(Math.min(size.width * 0.46, 260));
      const title = Math.round(Math.min(size.width * 0.092, 50));
      const html = `<!doctype html><html><head><style>${fonts}</style></head><body style="margin:0">
        <div style="width:100vw;height:100vh;background:${BROWN};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(title * 0.4)}px;font-family:Rubik">
          <img src="${emblemUri}" style="width:${emblem}px;height:${emblem}px" />
          <div style="font-family:Shrikhand;font-size:${title}px;line-height:1.06;color:#FCEBD0;text-shadow:3px 3px 0 #F06A1F;text-align:center">De Valkenburger<br/>Spelen</div>
          <div style="background:#F5AE1B;color:${BROWN};font-weight:800;font-size:${Math.round(title * 0.42)}px;padding:6px 16px;border-radius:999px">2027</div>
        </div></body></html>`;
      const file = path.join("splash", splashFileName(size));
      await render(browser, html, size.width, size.height, out(file), { scale: size.ratio });
      console.log(`✓ ${file}`);
    }

    // Share image (WhatsApp, Signal): no location, just the name and the dates.
    const og = `<!doctype html><html><head><style>${fonts}</style></head><body style="margin:0">
      <div style="position:relative;width:1200px;height:630px;overflow:hidden;background:${BROWN};font-family:Rubik;color:#FCEBD0">
        <div style="position:absolute;left:-60px;top:-520px;width:1300px;height:1300px;border-radius:50%;background:repeating-conic-gradient(from 0deg,#35200F 0deg 7deg,${BROWN} 7deg 14deg)"></div>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style="position:absolute;inset:0">
          <path d="M-10 26 H1092 A82 82 0 0 1 1174 108 V640" fill="none" stroke="#F5AE1B" stroke-width="12" stroke-linecap="round"/>
          <path d="M-10 44 H1092 A64 64 0 0 1 1156 108 V640" fill="none" stroke="#F06A1F" stroke-width="12" stroke-linecap="round"/>
          <path d="M-10 62 H1092 A46 46 0 0 1 1138 108 V640" fill="none" stroke="#B4441A" stroke-width="12" stroke-linecap="round"/>
        </svg>
        <div style="position:absolute;left:84px;top:118px;right:140px;display:flex;align-items:center;gap:56px">
          <img src="${emblemUri}" style="width:380px;height:380px;flex:none" />
          <div style="display:flex;flex-direction:column;gap:22px">
            <div style="font-family:Shrikhand;font-size:84px;line-height:1.02;text-shadow:5px 5px 0 #F06A1F">De Valkenburger<br/>Spelen</div>
            <div style="display:flex;align-items:center;gap:18px">
              <span style="background:#F5AE1B;color:${BROWN};font-weight:800;font-size:34px;padding:8px 22px;border-radius:999px">2027</span>
              <span style="font-weight:700;font-size:34px">Hemelvaart, 6 t/m 9 mei</span>
            </div>
          </div>
        </div>
      </div></body></html>`;
    await render(browser, og, 1200, 630, out("og.png"));
    console.log("✓ og.png");
  } finally {
    await browser.close();
  }
  await writeFile(out("brand", "README.md"), [
    "# Merk",
    "",
    "`embleem.svg` is de bron voor alle iconen, splashscreens en `og.png`.",
    "Nu is dat het voorlopige embleem uit de designreferentie. Komt het echte logo,",
    "vervang dan dit bestand (alleen het embleem, zonder tekst, vierkante viewBox)",
    "en draai `npm run icons`.",
    "",
  ].join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
