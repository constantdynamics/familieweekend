/**
 * Renders the design reference (docs/design/project/*.dc.html) to PNG in
 * docs/design/png, in each screen's start state, so the screens can be
 * compared side by side with the real app.
 *
 *   npm run design:png
 *
 * The .dc.html files run on the Claude canvas runtime. This script imitates
 * just enough of it: it runs the screen's `renderVals()` once and fills in
 * {{…}}, <sc-if> and <sc-for>. Buttons do nothing here.
 */
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const projectDir = path.join(root, "docs", "design", "project");
const outDir = path.join(root, "docs", "design", "png");

async function fontCss() {
  const font = async (file: string) => (await readFile(path.join(root, "src", "app", "fonts", file))).toString("base64");
  return (
    `@font-face{font-family:'Shrikhand';src:url(data:font/woff2;base64,${await font("shrikhand-latin.woff2")}) format('woff2');font-display:block}` +
    `@font-face{font-family:'Rubik';src:url(data:font/woff2;base64,${await font("rubik-latin-variable.woff2")}) format('woff2');font-weight:300 900;font-display:block}`
  );
}

/** Runs inside the page: a tiny stand-in for the canvas runtime. */
function hydrate(script: string) {
  class DCLogic {
    state: Record<string, unknown> = {};
    setState() {}
  }
  const Component = new Function("DCLogic", `${script}; return Component;`)(DCLogic);
  const instance = new Component();
  const vals: Record<string, unknown> = instance.renderVals();

  const resolve = (expr: string, scope: Record<string, unknown>): unknown => {
    const text = expr.trim();
    if (text === "true") return true;
    if (text === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return text.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], scope);
  };
  const fill = (template: string, scope: Record<string, unknown>) =>
    template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
      const value = resolve(expr, scope);
      return value === undefined || value === null || typeof value === "function" ? "" : String(value);
    });

  const walk = (node: Node, scope: Record<string, unknown>) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.includes("{{")) node.textContent = fill(node.textContent, scope);
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "sc-if") {
      const show = Boolean(resolve((node.getAttribute("value") ?? "").replace(/^\{\{|\}\}$/g, ""), scope));
      const parent = node.parentNode!;
      if (show) {
        for (const child of [...node.childNodes]) {
          parent.insertBefore(child, node);
          walk(child, scope);
        }
      }
      node.remove();
      return;
    }
    if (tag === "sc-for") {
      const list = resolve((node.getAttribute("list") ?? "").replace(/^\{\{|\}\}$/g, ""), scope);
      const as = node.getAttribute("as") ?? "item";
      const parent = node.parentNode!;
      for (const item of Array.isArray(list) ? list : []) {
        for (const child of [...node.childNodes]) {
          const clone = child.cloneNode(true);
          parent.insertBefore(clone, node);
          walk(clone, { ...scope, [as]: item });
        }
      }
      node.remove();
      return;
    }
    for (const attr of [...node.attributes]) {
      if (/^on[A-Z]/.test(attr.name) || /^on/.test(attr.name)) {
        node.removeAttribute(attr.name);
      } else if (attr.value.includes("{{")) {
        const single = /^\{\{([^}]+)\}\}$/.exec(attr.value.trim());
        const value = single ? resolve(single[1], scope) : fill(attr.value, scope);
        if (value === false || value === undefined || value === null) node.removeAttribute(attr.name);
        else node.setAttribute(attr.name, value === true ? "" : String(value));
      }
    }
    for (const child of [...node.childNodes]) walk(child, scope);
  };
  walk(document.body, vals);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const css = await fontCss();
  const canvas = JSON.parse(await readFile(path.join(projectDir, "canvas.json"), "utf8")) as {
    boards: Record<string, { w: number; h: number; title: string }>;
  };
  const files = (await readdir(projectDir)).filter((f) => f.endsWith(".dc.html"));
  const browser = await chromium.launch();
  try {
    for (const file of files) {
      const source = await readFile(path.join(projectDir, file), "utf8");
      const helmet = /<helmet>([\s\S]*?)<\/helmet>/.exec(source)?.[1] ?? "";
      const styles = [...helmet.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
      const body = /<\/helmet>([\s\S]*?)<\/x-dc>/.exec(source)?.[1] ?? "";
      const script = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(source)?.[1] ?? "class Component extends DCLogic { renderVals(){ return {}; } }";
      const board = canvas.boards[file] ?? { w: 390, h: 844 };
      const page = await browser.newPage({ viewport: { width: board.w, height: board.h }, deviceScaleFactor: 2 });
      await page.setContent(
        `<!doctype html><html lang="nl"><head><meta charset="utf-8"><script>window.__name=function(f){return f}</script><style>${css}${styles}*{animation:none!important;transition:none!important}</style></head><body>${body}</body></html>`,
      );
      await page.evaluate(hydrate, script);
      await page.evaluate(() => document.fonts.ready);
      const name = file.replace(".dc.html", ".png");
      await page.screenshot({ path: path.join(outDir, name), clip: { x: 0, y: 0, width: board.w, height: board.h } });
      await page.close();
      console.log(`✓ docs/design/png/${name}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
