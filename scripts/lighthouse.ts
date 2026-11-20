/**
 * Runs Lighthouse (mobile) against a local production build on the test
 * database: the code screen without a cookie, the other screens with a valid
 * family session. Run `npm run build` first.
 */
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { E2E } from "../playwright.config";

const port = "3200";
process.env.APP_SECRET = E2E.appSecret;

async function main() {
  const { createSessionToken } = await import("../src/lib/server/tokens");
  const token = await createSessionToken("lighthouse-toestel");
  const serverEnv = {
    ...process.env,
    DATABASE_URL: E2E.adminUrl.replace("postgres:postgres@", `valk_app:${E2E.appPassword}@`),
    DATABASE_SSL: "disable",
    APP_SECRET: E2E.appSecret,
    CRON_SECRET: E2E.cronSecret,
  };
  // A server left on this port would be measured instead of this build.
  const taken = await fetch(`http://localhost:${port}/api/health`).then(() => true, () => false);
  if (taken) throw new Error(`Poort ${port} is al in gebruik; stop die server eerst.`);
  // Own process group: npx starts next-server as a child, and both must stop.
  const server = spawn("npx", ["next", "start", "-p", port], { env: serverEnv, stdio: "ignore", detached: true });
  try {
    for (let i = 0; i < 60; i += 1) {
      const ok = await fetch(`http://localhost:${port}/api/health`).then((r) => r.ok, () => false);
      if (ok) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const chrome = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
    const runs = [
      { LH_PATHS: "/welkom", LH_COOKIE: "" },
      { LH_PATHS: "/,/programma,/score", LH_COOKIE: `valk_sessie=${token}` },
    ];
    let failed = false;
    for (const run of runs) {
      const result = spawnSync("npx", ["lhci", "autorun", "--config=lighthouserc.cjs"], {
        env: { ...process.env, ...run, LH_PORT: port, CHROME_PATH: chrome },
        stdio: "inherit",
      });
      if (result.status !== 0) failed = true;
      summarise();
    }
    process.exitCode = failed ? 1 : 0;
  } finally {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  }
}

/** One line per page: the three SPEC scores plus LCP and CLS. */
function summarise() {
  for (const file of readdirSync(".lighthouseci").filter((f) => /^lhr-.*\.json$/.test(f))) {
    const report = JSON.parse(readFileSync(`.lighthouseci/${file}`, "utf8"));
    const score = (key: string) => Math.round(report.categories[key].score * 100);
    console.log(
      `${new URL(report.finalDisplayedUrl).pathname.padEnd(12)} prestaties ${score("performance")}  toegankelijkheid ${score("accessibility")}  best practices ${score("best-practices")}  LCP ${Math.round(report.audits["largest-contentful-paint"].numericValue)} ms  CLS ${report.audits["cumulative-layout-shift"].numericValue.toFixed(3)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
