import type { LevelId, WeaponState } from "../types";

const LEVEL_LABELS: Record<LevelId, string> = {
  backrooms: "LEVEL 0 — YELLOW ZONE",
  mart: "LEVEL 1 — AISLE ZERO",
  hotel: "LEVEL 2 — SOFT LOBBY",
};

export interface HudController {
  show: () => void;
  hide: () => void;
  setLevel: (id: LevelId, objective: string) => void;
  setHealth: (health: number, max: number) => void;
  setAmmo: (weapon: WeaponState) => void;
  setDamageFlash: (amount: number) => void;
  showTransition: (text: string) => Promise<void>;
}

export function createHud(): HudController {
  const hud = document.getElementById("hud");
  const boot = document.getElementById("boot-screen");
  const levelEl = document.getElementById("hud-level");
  const objectiveEl = document.getElementById("hud-objective");
  const ammoEl = document.getElementById("hud-ammo");
  const healthEl = document.getElementById("hud-health");
  const healthFill = document.getElementById("health-fill");
  const vignette = document.getElementById("damage-vignette");
  const transition = document.getElementById("level-transition");
  const transitionText = document.getElementById("transition-text");

  const show = (): void => {
    hud?.classList.remove("hidden");
    hud?.setAttribute("aria-hidden", "false");
    boot?.classList.add("hidden");
  };

  const hide = (): void => {
    hud?.classList.add("hidden");
    hud?.setAttribute("aria-hidden", "true");
  };

  const setLevel = (id: LevelId, objective: string): void => {
    if (levelEl) levelEl.textContent = LEVEL_LABELS[id];
    if (objectiveEl) objectiveEl.textContent = objective;
  };

  const setHealth = (health: number, max: number): void => {
    const pct = Math.max(0, Math.min(1, health / max));
    if (healthEl) healthEl.textContent = String(Math.round(health));
    if (healthFill) healthFill.style.transform = `scaleX(${pct})`;
  };

  const setAmmo = (weapon: WeaponState): void => {
    if (!ammoEl) return;
    if (weapon.reloading) {
      ammoEl.textContent = "RELOADING…";
      return;
    }
    ammoEl.textContent = `${weapon.ammo} / ${weapon.reserve}`;
  };

  const setDamageFlash = (amount: number): void => {
    if (!vignette) return;
    const a = Math.max(0, Math.min(1, amount));
    vignette.style.opacity = String(a);
  };

  const showTransition = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!transition || !transitionText) {
        resolve();
        return;
      }
      transitionText.textContent = text;
      transition.classList.remove("hidden");
      window.setTimeout(() => {
        transition.classList.add("hidden");
        resolve();
      }, 900);
    });
  };

  return {
    show,
    hide,
    setLevel,
    setHealth,
    setAmmo,
    setDamageFlash,
    showTransition,
  };
}
