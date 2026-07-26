# FALL RUSH

First-person obstacle gauntlet in the browser — Fall Guys energy, Three.js + Rapier.

## Run

```bash
npm install
npm run dev
```

Open the URL, click **CLICK TO PLAY**, pointer-lock, then survive.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Space | Jump (coyote + buffer) |
| Shift | Sprint |
| Esc | Release pointer / pause hint |

## Stack

- Vite + TypeScript
- `three` + `postprocessing` (SSAO, bloom, chromatic, ACES, SMAA)
- `@dimforge/rapier3d-compat` physics
- Procedural Web Audio

## Course

Start → spinning candy rollers → hex hop → punch hammers → conveyors → slim beams → seesaw → finish podium.

## Scripts

```bash
npm run build
node scripts/capture.mjs   # Playwright screenshots (dev server required)
```
