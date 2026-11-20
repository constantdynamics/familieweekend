/**
 * Lighthouse CI: mobile, the SPEC §2 thresholds. Run with `npm run lighthouse`
 * (scripts/lighthouse.ts starts the server and passes a session cookie).
 */
const port = process.env.LH_PORT || "3200";
const cookie = process.env.LH_COOKIE;
const urls = (process.env.LH_PATHS || "/,/programma").split(",").map((path) => `http://localhost:${port}${path}`);

module.exports = {
  ci: {
    collect: {
      url: urls,
      numberOfRuns: 1,
      chromePath: process.env.CHROME_PATH,
      settings: {
        chromeFlags: "--no-sandbox --headless=new",
        ...(cookie ? { extraHeaders: JSON.stringify({ Cookie: cookie }) } : {}),
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
