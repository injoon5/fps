/**
 * Minimal Liquid Glass control panel — variant, IOR, comparison.
 */

import type { GlassVariant } from "../optics/index.ts";
import { OPTICAL_DEFAULTS } from "../optics/index.ts";
import type { LiquidGlassRenderer } from "../renderer/liquidGlassRenderer.ts";

export type ComparisonMode = "off" | "split" | "overlay";

export interface ControlsState {
  variant: GlassVariant;
  ior: number;
  comparison: ComparisonMode;
}

export interface ControlsHandles {
  root: HTMLElement;
  getState(): ControlsState;
  setVariant(variant: GlassVariant): void;
  setIOR(ior: number): void;
  setComparison(mode: ComparisonMode): void;
  destroy(): void;
}

export interface MountControlsOptions {
  renderer: LiquidGlassRenderer;
  /** Fired whenever comparison mode changes. */
  onComparisonChange?: (mode: ComparisonMode) => void;
  /** Fired on any state change. */
  onChange?: (state: ControlsState) => void;
  initial?: Partial<ControlsState>;
}

/**
 * Mount the side control panel into `host` and wire it to the renderer.
 */
export function mountControls(
  host: HTMLElement,
  options: MountControlsOptions,
): ControlsHandles {
  const { renderer, onComparisonChange, onChange } = options;
  const [iorLo, iorHi] = OPTICAL_DEFAULTS.iorRange;

  const state: ControlsState = {
    variant: options.initial?.variant ?? renderer.getVariant(),
    ior: options.initial?.ior ?? renderer.getIOR(),
    comparison: options.initial?.comparison ?? "off",
  };

  const root = document.createElement("aside");
  root.className = "controls";
  root.setAttribute("aria-label", "Liquid Glass controls");
  root.innerHTML = `
    <div class="controls__header">
      <span class="controls__eyebrow">Material</span>
      <button type="button" class="controls__collapse" aria-label="Collapse controls" data-action="collapse">
        <span></span>
      </button>
    </div>

    <div class="controls__body">
      <div class="controls__group" role="group" aria-label="Glass variant">
        <span class="controls__label">Variant</span>
        <div class="segmented" data-control="variant">
          <button type="button" class="segmented__btn" data-variant="regular" aria-pressed="false">Regular</button>
          <button type="button" class="segmented__btn" data-variant="clear" aria-pressed="false">Clear</button>
        </div>
      </div>

      <div class="controls__group">
        <div class="controls__label-row">
          <span class="controls__label">Index of refraction</span>
          <span class="controls__value" data-ior-value>${state.ior.toFixed(2)}</span>
        </div>
        <input
          class="slider"
          type="range"
          min="${iorLo}"
          max="${iorHi}"
          step="0.005"
          value="${state.ior}"
          data-control="ior"
          aria-label="Index of refraction"
        />
        <div class="controls__hint">
          <span>${iorLo.toFixed(2)}</span>
          <span>${iorHi.toFixed(2)}</span>
        </div>
      </div>

      <div class="controls__group" role="group" aria-label="Comparison">
        <span class="controls__label">Apple reference</span>
        <div class="segmented segmented--triple" data-control="comparison">
          <button type="button" class="segmented__btn" data-comparison="off" aria-pressed="false">Live</button>
          <button type="button" class="segmented__btn" data-comparison="split" aria-pressed="false">Split</button>
          <button type="button" class="segmented__btn" data-comparison="overlay" aria-pressed="false">Overlay</button>
        </div>
      </div>

      <p class="controls__footer">
        Drag glass · press to shimmer · click the capsule to morph
      </p>
    </div>
  `;

  host.appendChild(root);

  const iorInput = root.querySelector<HTMLInputElement>('[data-control="ior"]');
  const iorValue = root.querySelector<HTMLElement>("[data-ior-value]");
  const variantBtns = root.querySelectorAll<HTMLButtonElement>("[data-variant]");
  const comparisonBtns =
    root.querySelectorAll<HTMLButtonElement>("[data-comparison]");
  const collapseBtn = root.querySelector<HTMLButtonElement>('[data-action="collapse"]');

  function emit(): void {
    onChange?.(getState());
  }

  function getState(): ControlsState {
    return { ...state };
  }

  function syncVariantUI(): void {
    for (const btn of variantBtns) {
      const v = btn.dataset.variant as GlassVariant;
      const on = v === state.variant;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-active", on);
    }
  }

  function syncComparisonUI(): void {
    for (const btn of comparisonBtns) {
      const m = btn.dataset.comparison as ComparisonMode;
      const on = m === state.comparison;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-active", on);
    }
  }

  function syncIORUI(): void {
    if (iorInput) iorInput.value = String(state.ior);
    if (iorValue) iorValue.textContent = state.ior.toFixed(2);
  }

  function setVariant(variant: GlassVariant): void {
    state.variant = variant;
    renderer.setVariant(variant);
    syncVariantUI();
    emit();
  }

  function setIOR(ior: number): void {
    state.ior = ior;
    renderer.setIOR(ior);
    syncIORUI();
    emit();
  }

  function setComparison(mode: ComparisonMode): void {
    if (state.comparison === mode) return;
    state.comparison = mode;
    syncComparisonUI();
    onComparisonChange?.(mode);
    emit();
  }

  for (const btn of variantBtns) {
    btn.addEventListener("click", () => {
      const v = btn.dataset.variant as GlassVariant;
      setVariant(v);
    });
  }

  for (const btn of comparisonBtns) {
    btn.addEventListener("click", () => {
      const m = btn.dataset.comparison as ComparisonMode;
      setComparison(m);
    });
  }

  iorInput?.addEventListener("input", () => {
    const v = Number(iorInput.value);
    if (!Number.isFinite(v)) return;
    setIOR(v);
  });

  collapseBtn?.addEventListener("click", () => {
    root.classList.toggle("is-collapsed");
  });

  // Initial sync
  renderer.setVariant(state.variant);
  renderer.setIOR(state.ior);
  syncVariantUI();
  syncComparisonUI();
  syncIORUI();
  onComparisonChange?.(state.comparison);

  return {
    root,
    getState,
    setVariant,
    setIOR,
    setComparison,
    destroy() {
      root.remove();
    },
  };
}
