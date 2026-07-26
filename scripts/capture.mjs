import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const OUT = "/opt/cursor/artifacts/screenshots";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/local/bin/google-chrome",
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.error("PAGEERROR", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.error("CONSOLE", m.text());
});

const url = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173/";
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForFunction(() => !!window.__FALL_RUSH__, null, { timeout: 30000 });
await page.waitForTimeout(2800);

// 01 — title over live 3D attract (overlay is translucent)
await page.screenshot({ path: `${OUT}/pass1-01-title.png`, type: "png" });
await page.screenshot({ path: `${OUT}/01-title.png`, type: "png" });

await page.click("#start-btn");
await page.waitForTimeout(2400);
await page.screenshot({ path: `${OUT}/pass1-02-after-start.png`, type: "png" });
await page.screenshot({ path: `${OUT}/02-after-start.png`, type: "png" });

// World hero: sun-side three-quarter so soft pad shadows land on catcher
await page.evaluate(() => {
  const api = window.__FALL_RUSH__;
  if (!api) return;
  api.hideUi();
  api.setCamera(16.5, 8.8, 6.5, -2, 0.2, -24);
});
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/pass1-03-world-view.png`, type: "png" });
await page.screenshot({ path: `${OUT}/03-world-view.png`, type: "png" });

// Mid-course: hazard bloom + hex pads + water glints
await page.evaluate(() => {
  const api = window.__FALL_RUSH__;
  if (!api) return;
  api.hideUi();
  api.setCamera(13.0, 7.2, -18, -1, 0.3, -46);
});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/pass1-04-world-later.png`, type: "png" });
await page.screenshot({ path: `${OUT}/04-world-later.png`, type: "png" });

// Debug fly
await page.evaluate(() => {
  window.__FALL_RUSH__?.enableDebugFly();
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/pass1-05-fly.png`, type: "png" });

await browser.close();
console.log("done →", OUT);
