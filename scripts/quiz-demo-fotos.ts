/**
 * Draws the photos of the demo quiz (SPEC §9.5) as illustrated postcards
 * and writes them as JPEG into src/lib/server/quiz/demoPhotos.ts, which
 * "Zet de proef klaar" stores in valk.uploads. The build container has no
 * internet and there are no stock photos (SPEC §6.7), so they are drawn.
 *
 *   npx tsx scripts/quiz-demo-fotos.ts
 *
 * Only needed again when a drawing changes. Uses Playwright's Chromium.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const W = 800;
const H = 560;

const frame = (inner: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="foto"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>
  </defs>
  <g clip-path="url(#foto)">${inner}</g>
</svg>`;

function house(x: number, width: number, height: number, color: string, gable: "trap" | "klok" | "punt", seed: number): string {
  const base = 380;
  const top = base - height;
  const windows: string[] = [];
  const cols = width > 90 ? 3 : 2;
  const gap = width / (cols + 1);
  for (let row = 0; row < Math.floor((height - 60) / 58); row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const wx = x + gap * (col + 1) - 11;
      const wy = top + 46 + row * 58;
      windows.push(
        `<rect x="${wx}" y="${wy}" width="22" height="34" fill="#dfe9ea" stroke="#f8f4ea" stroke-width="4"/>` +
          `<line x1="${wx + 11}" y1="${wy}" x2="${wx + 11}" y2="${wy + 34}" stroke="#f8f4ea" stroke-width="2"/>`,
      );
    }
  }
  let roof = "";
  if (gable === "trap") {
    const s = width / 6;
    roof = `<path d="M${x} ${top} h${s} v-16 h${s} v-16 h${s} v-14 h${s} v14 h${s} v16 h${s} v16 z" fill="${color}"/>`;
  } else if (gable === "klok") {
    roof = `<path d="M${x} ${top} q${width * 0.1} -18 ${width * 0.22} -22 q${width * 0.05} -34 ${width * 0.28} -38 q${width * 0.23} 4 ${width * 0.28} 38 q${width * 0.12} 4 ${width * 0.22} 22 z" fill="${color}"/>`;
  } else {
    roof = `<path d="M${x} ${top} L${x + width / 2} ${top - 46} L${x + width} ${top} z" fill="${color}"/>`;
  }
  const hoist = `<line x1="${x + width / 2}" y1="${top - 10}" x2="${x + width / 2}" y2="${top + 8}" stroke="#2b1810" stroke-width="5"/>`;
  const door = `<rect x="${x + width / 2 - 13}" y="${base - 48}" width="26" height="48" rx="3" fill="#2b1810" opacity="${0.7 + (seed % 3) * 0.1}"/>`;
  return `<rect x="${x}" y="${top}" width="${width}" height="${height}" fill="${color}"/>${roof}${hoist}${windows.join("")}${door}`;
}

const PHOTOS: Record<string, string> = {
  valkenburgerstraat: frame(`
    <rect width="${W}" height="${H}" fill="#bcd9e6"/>
    <circle cx="660" cy="86" r="40" fill="#fff6dc"/>
    <path d="M90 90 q30 -26 66 -6 q24 -18 50 4 q-60 14 -116 2z" fill="#ffffff" opacity="0.9"/>
    ${house(30, 100, 250, "#9c4a32", "trap", 1)}
    ${house(130, 86, 288, "#5b3a29", "klok", 2)}
    ${house(216, 110, 236, "#e3cfa4", "punt", 3)}
    ${house(326, 92, 300, "#4d5b4f", "trap", 4)}
    ${house(418, 104, 262, "#c9893a", "klok", 5)}
    ${house(522, 90, 280, "#7a2f24", "punt", 6)}
    ${house(612, 118, 244, "#d9c08f", "trap", 7)}
    ${house(730, 90, 270, "#3d4a5c", "klok", 8)}
    <rect x="0" y="380" width="${W}" height="34" fill="#8d8478"/>
    <rect x="0" y="414" width="${W}" height="146" fill="#3f6f7a"/>
    <g stroke="#cfe3e6" stroke-width="3" opacity="0.6">
      <line x1="40" y1="450" x2="150" y2="450"/><line x1="260" y1="472" x2="400" y2="472"/>
      <line x1="520" y1="446" x2="640" y2="446"/><line x1="120" y1="512" x2="260" y2="512"/><line x1="560" y1="520" x2="720" y2="520"/>
    </g>
    <g fill="#7a1f1a">
      ${[70, 170, 270, 370, 470, 570, 670, 760].map((px) => `<rect x="${px}" y="388" width="12" height="40" rx="5"/>`).join("")}
    </g>
    <g fill="#ffffff" font-family="Arial, sans-serif" font-size="9" font-weight="700">
      ${[70, 170, 270, 370, 470, 570, 670, 760].map((px) => `<text x="${px + 1}" y="402">XXX</text>`).join("")}
    </g>
    <g stroke="#2b1810" stroke-width="5" fill="none">
      <circle cx="560" cy="398" r="22"/><circle cx="626" cy="398" r="22"/>
      <path d="M560 398 l26 -36 h30 l10 36 M586 362 l-6 -12 M612 362 l6 -14 h14"/>
    </g>
    <rect x="96" y="210" width="10" height="190" fill="#2b1810"/>
    <rect x="14" y="174" width="264" height="54" rx="6" fill="#ffffff" stroke="#1f3b78" stroke-width="5"/>
    <text x="146" y="209" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#1f3b78">Valkenburgerstraat</text>
  `),
  falkenberg: frame(`
    <rect width="${W}" height="${H}" fill="#c7e3f0"/>
    <path d="M0 150 q120 -40 260 -6 q140 30 280 -10 q140 -36 260 4 v120 H0z" fill="#9db7a1"/>
    <rect x="0" y="300" width="${W}" height="260" fill="#2f6f8f"/>
    <g stroke="#e3f1f6" stroke-width="3" opacity="0.55">
      <line x1="40" y1="340" x2="170" y2="340"/><line x1="300" y1="360" x2="420" y2="360"/><line x1="560" y1="330" x2="700" y2="330"/>
      <line x1="100" y1="420" x2="260" y2="420"/><line x1="470" y1="440" x2="640" y2="440"/>
    </g>
    <path d="M0 300 h300 l40 30 h-340z" fill="#7f8b86"/>
    <g>
      <rect x="40" y="200" width="120" height="100" fill="#8e2a1f"/><path d="M30 202 L100 150 L170 202z" fill="#3b2a26"/>
      <rect x="62" y="226" width="22" height="26" fill="#f6f1e6"/><rect x="116" y="226" width="22" height="26" fill="#f6f1e6"/>
      <rect x="40" y="200" width="6" height="100" fill="#f6f1e6"/><rect x="154" y="200" width="6" height="100" fill="#f6f1e6"/>
      <rect x="176" y="222" width="100" height="78" fill="#a3362a"/><path d="M168 224 L226 184 L284 224z" fill="#3b2a26"/>
      <rect x="196" y="244" width="20" height="24" fill="#f6f1e6"/><rect x="238" y="244" width="20" height="24" fill="#f6f1e6"/>
    </g>
    <path d="M330 300 q70 -70 140 0 q70 -70 140 0 v22 h-280z" fill="#d9d4c7"/>
    <path d="M360 300 q40 -40 80 0z M500 300 q40 -40 80 0z" fill="#2f6f8f"/>
    <rect x="690" y="120" width="8" height="200" fill="#e9e4d8"/>
    <g transform="translate(698 124)">
      <rect width="96" height="60" fill="#006aa7"/><rect x="30" width="14" height="60" fill="#fecc00"/><rect y="23" width="96" height="14" fill="#fecc00"/>
    </g>
    <path d="M0 470 q180 -40 400 -6 q-40 50 -40 96 H0z" fill="#d8c79a"/>
    <path d="M0 500 q120 -16 260 0 v60 H0z" fill="#9db7a1"/>
    <g transform="translate(190 470)">
      <rect x="-4" y="-6" width="8" height="70" fill="#5c4033"/>
      <rect x="-92" y="-52" width="184" height="46" rx="6" fill="#f6f1e6" stroke="#2b1810" stroke-width="3"/>
      <text x="0" y="-21" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#2b1810">Välkommen</text>
    </g>
    <path d="M520 110 q14 -12 28 0 q14 -12 28 0" stroke="#2b1810" stroke-width="4" fill="none"/>
  `),
  falconara: frame(`
    <rect width="${W}" height="${H}" fill="#9fd3ec"/>
    <circle cx="120" cy="96" r="46" fill="#ffe08a"/>
    <rect x="0" y="210" width="${W}" height="120" fill="#1f7fb0"/>
    <g stroke="#d8f0fa" stroke-width="3" opacity="0.6"><line x1="80" y1="250" x2="220" y2="250"/><line x1="380" y1="236" x2="520" y2="236"/><line x1="560" y1="290" x2="720" y2="290"/></g>
    <rect x="0" y="330" width="${W}" height="230" fill="#efd39b"/>
    <g>
      <path d="M150 360 q70 -60 140 0z" fill="#f06a1f"/><path d="M185 360 q35 -60 35 0z" fill="#ffffff"/><path d="M255 360 q-35 -60 -35 0z" fill="#ffffff"/>
      <rect x="217" y="358" width="6" height="90" fill="#5c4033"/>
      <path d="M430 380 q70 -60 140 0z" fill="#6f9a3a"/><path d="M465 380 q35 -60 35 0z" fill="#ffffff"/><path d="M535 380 q-35 -60 -35 0z" fill="#ffffff"/>
      <rect x="497" y="378" width="6" height="90" fill="#5c4033"/>
    </g>
    <rect x="80" y="430" width="90" height="24" rx="6" fill="#f06a1f"/><rect x="560" y="470" width="90" height="24" rx="6" fill="#4fa3a5"/>
    <g transform="translate(680 300)">
      <rect x="-4" y="0" width="7" height="200" fill="#e9e4d8"/>
      <rect x="3" y="4" width="30" height="52" fill="#009246"/><rect x="33" y="4" width="30" height="52" fill="#ffffff"/><rect x="63" y="4" width="30" height="52" fill="#ce2b37"/>
    </g>
    <g transform="translate(300 420)">
      <rect x="0" y="0" width="150" height="96" rx="8" fill="#fff6e6" stroke="#2b1810" stroke-width="3"/>
      <rect x="0" y="0" width="150" height="30" rx="8" fill="#f5ae1b"/>
      <text x="75" y="22" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="#2b1810">Gelateria</text>
      <circle cx="40" cy="58" r="12" fill="#f7b6c8"/><circle cx="75" cy="58" r="12" fill="#c98b5a"/><circle cx="110" cy="58" r="12" fill="#a7b43a"/>
    </g>
    <path d="M330 120 q30 -22 60 -4 q30 -18 60 4 q-30 -6 -60 12 q-30 -18 -60 -12z" fill="#2b1810"/>
    <path d="M560 210 l40 -26 l44 26z" fill="#f3f1ea"/><rect x="598" y="184" width="4" height="26" fill="#f3f1ea"/>
  `),
  koe: frame(`
    <rect width="${W}" height="${H}" fill="#c9e7f5"/>
    <rect x="0" y="300" width="${W}" height="260" fill="#3aa6c9"/>
    <g stroke="#e6f6fb" stroke-width="3" opacity="0.7"><line x1="60" y1="360" x2="200" y2="360"/><line x1="420" y1="400" x2="580" y2="400"/><line x1="200" y1="470" x2="360" y2="470"/></g>
    <rect x="0" y="286" width="${W}" height="18" fill="#f3f1ea"/>
    <rect x="80" y="210" width="40" height="90" fill="#d7d2c7"/>
    <rect x="60" y="196" width="420" height="20" rx="6" fill="#4fa3a5"/>
    <g transform="translate(300 112)">
      <ellipse cx="60" cy="52" rx="70" ry="38" fill="#fbfaf6" stroke="#2b1810" stroke-width="4"/>
      <path d="M20 30 q20 -10 30 10 q-10 24 -34 10z" fill="#2b1810"/><path d="M80 60 q24 -14 34 6 q-14 22 -34 6z" fill="#2b1810"/>
      <rect x="10" y="80" width="12" height="20" fill="#2b1810"/><rect x="40" y="80" width="12" height="20" fill="#2b1810"/>
      <rect x="80" y="80" width="12" height="20" fill="#2b1810"/><rect x="106" y="80" width="12" height="20" fill="#2b1810"/>
      <ellipse cx="140" cy="36" rx="26" ry="22" fill="#fbfaf6" stroke="#2b1810" stroke-width="4"/>
      <ellipse cx="156" cy="44" rx="12" ry="9" fill="#f2b8a8"/>
      <circle cx="136" cy="30" r="4" fill="#2b1810"/>
      <path d="M128 14 l-8 -12 M150 14 l8 -12" stroke="#2b1810" stroke-width="4"/>
      <path d="M-8 44 q-14 10 -6 26" stroke="#2b1810" stroke-width="4" fill="none"/>
    </g>
    <path d="M630 300 v-90 q0 -22 22 -22 M690 300 v-90 q0 -22 22 -22" stroke="#d7d2c7" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M630 250 h60 M630 280 h60" stroke="#d7d2c7" stroke-width="6"/>
    <g transform="translate(560 430)">
      <circle r="46" fill="#f06a1f"/><circle r="24" fill="#3aa6c9"/>
      <path d="M-46 0 h22 M24 0 h22 M0 -46 v22 M0 24 v22" stroke="#fbfaf6" stroke-width="12"/>
    </g>
  `),
  pompoen: frame(`
    <rect width="${W}" height="${H}" fill="#e7d9b8"/>
    <rect x="0" y="330" width="${W}" height="230" fill="#7c9a4a"/>
    <rect x="0" y="120" width="${W}" height="16" fill="#9c7b52"/>
    <g fill="#9c7b52">${[40, 160, 280, 400, 520, 640, 760].map((px) => `<rect x="${px}" y="100" width="14" height="240"/>`).join("")}</g>
    <g transform="translate(180 170)">
      <path d="M60 210 h330 l-40 70 h-250z" fill="#6b6f74"/>
      <circle cx="120" cy="300" r="26" fill="#2b1810"/><rect x="380" y="216" width="120" height="14" rx="7" fill="#5c4033" transform="rotate(14 380 216)"/>
      <ellipse cx="225" cy="140" rx="170" ry="118" fill="#f06a1f"/>
      <ellipse cx="225" cy="140" rx="110" ry="118" fill="#f47f35"/>
      <ellipse cx="225" cy="140" rx="45" ry="118" fill="#e45f16"/>
      <path d="M215 26 q6 -34 30 -40" stroke="#4f6a2a" stroke-width="14" fill="none" stroke-linecap="round"/>
    </g>
    <g transform="translate(600 210)">
      <circle cx="40" cy="0" r="28" fill="#f2c9a4"/><path d="M14 -8 q26 -34 54 0" fill="#7a4a2a"/>
      <rect x="14" y="30" width="52" height="90" rx="16" fill="#4fa3a5"/>
      <rect x="18" y="120" width="16" height="50" fill="#2b1810"/><rect x="46" y="120" width="16" height="50" fill="#2b1810"/>
      <path d="M14 50 l-40 -30" stroke="#f2c9a4" stroke-width="12" stroke-linecap="round"/>
    </g>
    <g transform="translate(470 150)">
      <circle r="34" fill="#f5ae1b"/><circle r="22" fill="#fff6e6"/>
      <text y="7" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#2b1810">1e</text>
      <path d="M-14 30 l-10 40 l14 -8 l8 14 l6 -44z M14 30 l10 40 l-14 -8 l-8 14 l-6 -44z" fill="#b4441a"/>
    </g>
  `),
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const entries: string[] = [];
  for (const [key, svg] of Object.entries(PHOTOS)) {
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 74, clip: { x: 0, y: 0, width: W, height: H } });
    entries.push(`  ${key}: { width: ${W}, height: ${H}, base64: "${jpeg.toString("base64")}" },`);
    console.log(`${key}: ${Math.round(jpeg.length / 1024)} kB`);
  }
  await browser.close();
  const file = `/**
 * The drawn postcards of the demo quiz, as JPEG. Generated by
 * scripts/quiz-demo-fotos.ts; do not edit by hand. Server only: they reach
 * phones through valk.uploads and signed links, like every quiz photo.
 */
import "server-only";

export type DemoPhoto = { width: number; height: number; base64: string };

export const DEMO_PHOTOS = {
${entries.join("\n")}
} satisfies Record<string, DemoPhoto>;
`;
  await writeFile(path.join(process.cwd(), "src", "lib", "server", "quiz", "demoPhotos.ts"), file);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
