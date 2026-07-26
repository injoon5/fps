/**
 * Liquid Glass showcase — Apple WWDC-style demo.
 *
 * Full-viewport canvas, photographic wallpaper, seeded glass elements
 * (capsule toolbar, squircle card, circle FAB, morphing menu), pointer
 * interaction via the renderer, and a minimal material control panel.
 */

import "./style.css";
import { LiquidGlassRenderer } from "./renderer/liquidGlassRenderer.ts";
import {
  mountControls,
  type ComparisonMode,
} from "./ui/controls.ts";
import { GlassBody, type GlassRect } from "./physics/index.ts";

/** Wallpaper under the live glass (Music scene works as rich content). */
const BG_URL = "/refs/apple-music.jpg";
/** Canonical Apple references — Music + Control Center only. */
const REF_URL = "/refs/control-center.png";

function layoutRects(w: number, h: number): {
  toolbar: GlassRect;
  card: GlassRect;
  fab: GlassRect;
  morphCollapsed: GlassRect;
  morphExpanded: GlassRect;
} {
  const cx = w * 0.5;
  const cy = h * 0.52;

  return {
    toolbar: {
      x: cx,
      y: Math.min(h - 56, h * 0.86),
      w: Math.min(340, w * 0.55),
      h: 52,
    },
    card: {
      x: Math.max(120, w * 0.28),
      y: Math.max(160, cy - 40),
      w: Math.min(200, w * 0.28),
      h: Math.min(200, w * 0.28),
    },
    fab: {
      x: Math.min(w - 72, w * 0.72),
      y: Math.max(180, cy + 20),
      w: 64,
      h: 64,
    },
    morphCollapsed: {
      x: cx,
      y: Math.max(140, h * 0.28),
      w: 128,
      h: 40,
    },
    morphExpanded: {
      x: cx,
      y: Math.max(200, h * 0.34),
      w: Math.min(280, w * 0.42),
      h: Math.min(220, h * 0.32),
    },
  };
}

function buildDom(app: HTMLElement): {
  stage: HTMLElement;
  live: HTMLElement;
  canvas: HTMLCanvasElement;
  refPane: HTMLElement;
  refImg: HTMLImageElement;
  overlay: HTMLElement;
  overlayImg: HTMLImageElement;
  controlsHost: HTMLElement;
} {
  app.innerHTML = `
    <header class="brand" aria-label="Liquid Glass">
      <h1 class="brand__title">Liquid Glass</h1>
      <p class="brand__subtitle">
        An optical recreation of Apple’s WWDC material — lensing, bevel specular, and gel motion.
      </p>
    </header>

    <div class="stage" data-stage>
      <div class="stage__live">
        <span class="stage__live-label">Live</span>
        <canvas data-canvas></canvas>
      </div>
      <div class="stage__ref" data-ref-pane>
        <span class="stage__ref-label">Apple reference</span>
        <img data-ref-img alt="Apple Liquid Glass reference" decoding="async" />
      </div>
    </div>

    <div class="comparison-overlay" data-overlay aria-hidden="true">
      <img data-overlay-img alt="" decoding="async" />
      <div class="comparison-overlay__badge">Reference overlay</div>
    </div>

    <div class="controls-host" data-controls-host></div>
  `;

  const stage = app.querySelector<HTMLElement>("[data-stage]")!;
  const live = app.querySelector<HTMLElement>(".stage__live")!;
  const canvas = app.querySelector<HTMLCanvasElement>("[data-canvas]")!;
  const refPane = app.querySelector<HTMLElement>("[data-ref-pane]")!;
  const refImg = app.querySelector<HTMLImageElement>("[data-ref-img]")!;
  const overlay = app.querySelector<HTMLElement>("[data-overlay]")!;
  const overlayImg = app.querySelector<HTMLImageElement>("[data-overlay-img]")!;
  const controlsHost = app.querySelector<HTMLElement>("[data-controls-host]")!;

  return {
    stage,
    live,
    canvas,
    refPane,
    refImg,
    overlay,
    overlayImg,
    controlsHost,
  };
}

function applyComparison(
  mode: ComparisonMode,
  stage: HTMLElement,
  overlay: HTMLElement,
): void {
  stage.classList.toggle("is-split", mode === "split");
  overlay.classList.toggle("is-on", mode === "overlay");
  overlay.setAttribute("aria-hidden", mode === "overlay" ? "false" : "true");
}

async function main(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) throw new Error("#app missing");

  const ui = buildDom(app);
  const renderer = new LiquidGlassRenderer(ui.canvas);

  // Drop the auto-created primary — showcase seeds its own glasses.
  for (const { id } of renderer.listGlasses()) {
    renderer.removeGlass(id);
  }

  // Reference images for comparison (HowToGeek iOS 26 Control Center)
  ui.refImg.src = REF_URL;
  ui.overlayImg.src = REF_URL;
  ui.refImg.addEventListener(
    "load",
    () => ui.refImg.classList.add("is-ready"),
    { once: true },
  );

  try {
    await renderer.setBackgroundFromUrl(BG_URL);
  } catch (err) {
    console.warn("Background load failed, using procedural wallpaper:", err);
    renderer.useProceduralBackground();
  }

  let morphExpanded = false;
  let morphCollapsedRect = layoutRects(1, 1).morphCollapsed;
  let morphExpandedRect = layoutRects(1, 1).morphExpanded;

  const toolbarBody = new GlassBody({
    rect: { x: 0, y: 0, w: 320, h: 52 },
    cornerN: 2.4,
    visible: false,
  });
  const cardBody = new GlassBody({
    rect: { x: 0, y: 0, w: 180, h: 180 },
    cornerN: 1.8,
    visible: false,
  });
  const fabBody = new GlassBody({
    rect: { x: 0, y: 0, w: 64, h: 64 },
    cornerN: 4,
    visible: false,
  });
  const morphBody = new GlassBody({
    rect: { x: 0, y: 0, w: 128, h: 40 },
    cornerN: 2.2,
    visible: false,
  });

  const toolbarId = renderer.addGlass(toolbarBody, "toolbar");
  const cardId = renderer.addGlass(cardBody, "card");
  const fabId = renderer.addGlass(fabBody, "fab");
  const morphId = renderer.addGlass(morphBody, "morph");
  renderer.setPrimary(cardId);

  const toolbar = renderer.getGlass(toolbarId)!;
  const card = renderer.getGlass(cardId)!;
  const fab = renderer.getGlass(fabId)!;
  const morph = renderer.getGlass(morphId)!;

  function relayout(animate: boolean): void {
    const w = ui.live.clientWidth || window.innerWidth;
    const h = ui.live.clientHeight || window.innerHeight;
    const L = layoutRects(w, h);
    morphCollapsedRect = L.morphCollapsed;
    morphExpandedRect = L.morphExpanded;

    const morphTarget = morphExpanded ? L.morphExpanded : L.morphCollapsed;
    const morphCorner = morphExpanded ? 1.75 : 2.2;

    if (animate) {
      toolbar.setTargetRect(L.toolbar, 2.4);
      card.setTargetRect(L.card, 1.8);
      fab.setTargetRect(L.fab, 4);
      morph.setTargetRect(morphTarget, morphCorner);
    } else {
      toolbar.snapTo(L.toolbar, 2.4);
      card.snapTo(L.card, 1.8);
      fab.snapTo(L.fab, 4);
      morph.snapTo(morphTarget, morphCorner);
    }
  }

  function resize(): void {
    // Drawing buffer is resized each frame via ensureDrawingBuffer.
    // Relayout glass targets to the live pane CSS size.
    relayout(false);
  }

  resize();
  window.addEventListener("resize", () => {
    resize();
  });

  // Staggered materialize — Apple WWDC entrance
  const entrances: Array<{ body: GlassBody; delay: number }> = [
    { body: card, delay: 180 },
    { body: fab, delay: 320 },
    { body: morph, delay: 420 },
    { body: toolbar, delay: 560 },
  ];
  for (const { body, delay } of entrances) {
    window.setTimeout(() => body.show(), delay);
  }

  // Controls
  mountControls(ui.controlsHost, {
    renderer,
    onComparisonChange(mode) {
      applyComparison(mode, ui.stage, ui.overlay);
      // After split toggle, live pane size changes — remeasure.
      requestAnimationFrame(() => {
        resize();
        relayout(true);
      });
    },
  });

  // Morph toggle on tap (renderer already handles drag/press/shimmer).
  renderer.onGlassTap((id, body) => {
    if (id !== morphId) return;
    morphExpanded = !morphExpanded;
    const target = morphExpanded ? morphExpandedRect : morphCollapsedRect;
    const corner = morphExpanded ? 1.75 : 2.2;
    body.morphTo(target, corner);
  });

  renderer.start();
}

main().catch((err) => {
  console.error("Liquid Glass failed to start:", err);
});
