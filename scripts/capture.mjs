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
await page.waitForTimeout(2600);

const prefix = process.env.CAPTURE_PREFIX ?? "wow";

// 01 — title over live 3D attract
await page.screenshot({ path: `${OUT}/${prefix}-01-title.png`, type: "png" });

// FP from start pad looking down-course — vinyl + contact + set dressing
await page.evaluate(() => {
  const api = window.__FALL_RUSH__;
  if (!api) return;
  api.hideUi();
  api.setFirstPerson(0, 2.25, 2.55, 0, -0.16);
});
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/${prefix}-fp-start.png`, type: "png" });

// FP near spin / candy rollers — densified sides
await page.evaluate(() => {
  const api = window.__FALL_RUSH__;
  if (!api) return;
  api.hideUi();
  api.setFirstPerson(0.35, 2.2, -16.2, 0.06, -0.1);
});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/${prefix}-fp-spin.png`, type: "png" });

// World three-quarter — sun-side shadows + dressing density
await page.evaluate(() => {
  const api = window.__FALL_RUSH__;
  if (!api) return;
  api.hideUi();
  api.setCamera(15.5, 8.2, 7.5, -1.5, 0.35, -22);
});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/${prefix}-world.png`, type: "png" });

// Finish podium spectacle
await page.evaluate(() => {
  const api = window.__FALL_RUSH__;
  if (!api) return;
  api.hideUi();
  api.setCamera(10, 6.5, -188, 0, 3.2, -206);
});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/${prefix}-finish.png`, type: "png" });

// Debug fly hero
await page.evaluate(() => {
  window.__FALL_RUSH__?.enableDebugFly();
});
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/${prefix}-fly-hero.png`, type: "png" });

await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/${prefix}-fly-mid.png`, type: "png" });

await browser.close();
console.log("done →", OUT, `(${prefix}-*)`);
