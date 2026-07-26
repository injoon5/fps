# Liquid Glass

Optical recreation of Apple’s WWDC **Liquid Glass** material — lensing, bevel specular, frost, and gel spring motion — as an interactive WebGL/Canvas showcase.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL (default `http://localhost:5173`).

## What’s on screen

- Full-viewport canvas over `/refs/apple-music.jpg` (procedural fallback)
- Seeded glass: capsule toolbar, squircle card, circle FAB, and a morphing capsule → menu panel
- Drag glasses; press for spring squash + shimmer
- Side panel: Regular / Clear variant, IOR slider, Live / Split / Overlay vs Apple refs (`/refs/apple-music.jpg`, `/refs/control-center.png`)
- Idle specular autodrama so highlights keep drifting

## Optical stack

1. **Background** — cover-fit wallpaper (or procedural cool neutrals)
2. **Contact shadow** — soft adaptive umbra under each plate
3. **SDF silhouette** — rounded / capsule / circle planform with soft AA
4. **Bevel normals** — flat center, rim tilt (continuous-corner feel)
5. **Refraction** — Snell-style UV bend driven by IOR + thickness
6. **Dispersion** — subtle chromatic fringe at high curvature
7. **Frost** — multi-tap blur (Regular ≫ Clear)
8. **Specular** — Fresnel + motion-tracked key light + rim
9. **Materialize** — springs modulate lensing/specular on entrance (not mere opacity)

Physics lives in `src/physics/*`, optics helpers in `src/optics/*`, renderer at `src/renderer/liquidGlassRenderer.ts`.
