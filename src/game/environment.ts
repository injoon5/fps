import * as THREE from "three";
import { Palette } from "./config";

function makeSparkleTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,240,180,0.85)");
  g.addColorStop(0.55, "rgba(255,180,120,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  // Cross sparkle
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.lineTo(32, 56);
  ctx.moveTo(8, 32);
  ctx.lineTo(56, 32);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeConfettiTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(6, 10, 20, 12);
  ctx.globalAlpha = 0.55;
  ctx.fillRect(4, 8, 24, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Stadium sky, layered void haze, caustic water, confetti + sparkles. */
export function buildEnvironment(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  water: THREE.Mesh;
  update: (t: number, follow?: THREE.Vector3) => void;
  dispose: () => void;
} {
  const disposables: Array<{ dispose: () => void }> = [];

  // Match fog to horizon so distant course melts into stadium void
  scene.background = null;
  scene.fog = new THREE.FogExp2(Palette.skyHorizon, 0.0095);

  const hemi = new THREE.HemisphereLight(Palette.skyTop, Palette.deepTeal, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe2b8, 2.55);
  sun.position.set(48, 72, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 180;
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2.25;
  sun.target.position.set(0, 0, -60);
  scene.add(sun);
  scene.add(sun.target);

  // Soft bounce fill — teal from below/side for contact read on jelly
  const fill = new THREE.DirectionalLight(Palette.teal, 0.42);
  fill.position.set(-38, 16, -28);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(Palette.hot, 0.32);
  rim.position.set(12, 10, -55);
  scene.add(rim);

  // Warm ground bounce so underside of platforms aren't pure black
  const bounce = new THREE.DirectionalLight(Palette.sun, 0.22);
  bounce.position.set(0, -20, -40);
  scene.add(bounce);

  // ——— Gradient sky dome (fog disabled so void stays luminous) ———
  const skyGeo = new THREE.SphereGeometry(380, 64, 32);
  disposables.push(skyGeo);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(Palette.skyTop) },
      midColor: { value: new THREE.Color(0xffd4a8) },
      bottomColor: { value: new THREE.Color(Palette.deepTeal) },
      hazeColor: { value: new THREE.Color(Palette.skyHorizon) },
      sunDir: { value: new THREE.Vector3(0.35, 0.62, 0.22).normalize() },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      uniform vec3 hazeColor;
      uniform vec3 sunDir;
      uniform float time;
      varying vec3 vWorldPos;
      varying vec3 vDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;

        vec3 col = mix(bottomColor, hazeColor, smoothstep(-0.15, 0.18, h));
        col = mix(col, midColor, smoothstep(0.05, 0.42, h));
        col = mix(col, topColor, smoothstep(0.35, 0.95, h));

        // Soft horizon band — stadium void read
        float horizon = exp(-pow(h * 4.5, 2.0));
        col = mix(col, hazeColor * 1.08, horizon * 0.55);

        // Sun disc + corona
        float sunDot = max(dot(dir, sunDir), 0.0);
        float disc = pow(sunDot, 420.0);
        float corona = pow(sunDot, 18.0);
        float glow = pow(sunDot, 4.5);
        col += vec3(1.0, 0.92, 0.72) * disc * 2.2;
        col += vec3(1.0, 0.78, 0.45) * corona * 0.85;
        col += vec3(1.0, 0.7, 0.4) * glow * 0.28;

        // Subtle atmospheric grain (cheap stars / dust)
        float grain = hash(dir.xz * 80.0 + time * 0.01);
        col += vec3(grain) * 0.025 * smoothstep(0.2, 0.9, h);

        // Lower void vignette into deep teal
        col = mix(col, bottomColor, smoothstep(0.05, -0.55, h) * 0.65);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  disposables.push(skyMat);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1000;
  scene.add(sky);

  // Distant stadium rings
  const ringGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const ringMat = new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? Palette.hot : Palette.lime,
      roughness: 0.38,
      metalness: 0.28,
      emissive: i % 2 === 0 ? Palette.hot : Palette.lime,
      emissiveIntensity: 0.28,
    });
    disposables.push(ringMat);
    const ringGeo = new THREE.TorusGeometry(52 + i * 20, 0.95 + i * 0.08, 10, 96);
    disposables.push(ringGeo);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -5 + i * 2.8;
    ring.castShadow = false;
    ring.receiveShadow = false;
    ringGroup.add(ring);
  }
  scene.add(ringGroup);

  // Haze discs for depth in the void
  const hazeGroup = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const hazeMat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? Palette.skyHorizon : Palette.teal,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    disposables.push(hazeMat);
    const hazeGeo = new THREE.CircleGeometry(70 + i * 35, 48);
    disposables.push(hazeGeo);
    const haze = new THREE.Mesh(hazeGeo, hazeMat);
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = -6.5 + i * 0.4;
    hazeGroup.add(haze);
  }
  scene.add(hazeGroup);

  // ——— Confetti ———
  const confettiCount = 520;
  const confettiGeo = new THREE.BufferGeometry();
  disposables.push(confettiGeo);
  const positions = new Float32Array(confettiCount * 3);
  const colors = new Float32Array(confettiCount * 3);
  const phases = new Float32Array(confettiCount);
  const speeds = new Float32Array(confettiCount);
  const palette = [
    new THREE.Color(Palette.lime),
    new THREE.Color(Palette.hot),
    new THREE.Color(Palette.sun),
    new THREE.Color(Palette.teal),
    new THREE.Color(Palette.platformAlt),
    new THREE.Color(Palette.foam),
  ];
  for (let i = 0; i < confettiCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = Math.random() * 70 + 4;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 260 - 40;
    const c = palette[i % palette.length]!;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.55 + Math.random() * 0.9;
  }
  confettiGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  confettiGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const confettiTex = makeConfettiTexture();
  disposables.push(confettiTex);
  const confettiMat = new THREE.PointsMaterial({
    size: 0.48,
    map: confettiTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.08,
  });
  disposables.push(confettiMat);
  const confetti = new THREE.Points(confettiGeo, confettiMat);
  confetti.frustumCulled = false;
  scene.add(confetti);

  // ——— Sparkles (additive twinkles) ———
  const sparkleCount = 180;
  const sparkleGeo = new THREE.BufferGeometry();
  disposables.push(sparkleGeo);
  const sPos = new Float32Array(sparkleCount * 3);
  const sCol = new Float32Array(sparkleCount * 3);
  const sPhase = new Float32Array(sparkleCount);
  for (let i = 0; i < sparkleCount; i++) {
    sPos[i * 3] = (Math.random() - 0.5) * 120;
    sPos[i * 3 + 1] = Math.random() * 28 + 1;
    sPos[i * 3 + 2] = (Math.random() - 0.5) * 180 - 30;
    const c = palette[(i * 3) % palette.length]!;
    sCol[i * 3] = c.r;
    sCol[i * 3 + 1] = c.g;
    sCol[i * 3 + 2] = c.b;
    sPhase[i] = Math.random() * Math.PI * 2;
  }
  sparkleGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  sparkleGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));

  const sparkleTex = makeSparkleTexture();
  disposables.push(sparkleTex);
  const sparkleMat = new THREE.PointsMaterial({
    size: 0.85,
    map: sparkleTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  disposables.push(sparkleMat);
  const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
  sparkles.frustumCulled = false;
  scene.add(sparkles);

  // ——— Water void ———
  const waterGeo = new THREE.CircleGeometry(220, 96);
  disposables.push(waterGeo);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      deepColor: { value: new THREE.Color(Palette.void) },
      waterColor: { value: new THREE.Color(Palette.water) },
      foamColor: { value: new THREE.Color(Palette.teal) },
      sunDir: { value: new THREE.Vector3(0.35, 0.62, 0.22).normalize() },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w1 = sin(p.x * 0.08 + time * 0.9) * 0.18;
        float w2 = cos(p.y * 0.11 + time * 1.15) * 0.12;
        p.z += w1 + w2;
        vWave = w1 + w2;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 deepColor;
      uniform vec3 waterColor;
      uniform vec3 foamColor;
      uniform vec3 sunDir;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vWave;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main() {
        vec2 uv = vWorldPos.xz * 0.035;
        float n1 = noise(uv * 3.0 + time * 0.15);
        float n2 = noise(uv * 7.0 - time * 0.22);
        float caustic = pow(n1 * n2 * 1.6, 2.2);

        float radial = length(vUv - 0.5) * 2.0;
        vec3 col = mix(waterColor, deepColor, smoothstep(0.15, 1.05, radial));
        col += foamColor * caustic * 0.35;
        col += foamColor * (0.08 + vWave * 0.25);

        // Specular sun glint strip
        float glint = pow(max(dot(normalize(vec3(n1 - 0.5, 0.85, n2 - 0.5)), sunDir), 0.0), 48.0);
        col += vec3(1.0, 0.92, 0.7) * glint * 0.55;

        float alpha = mix(0.92, 0.78, caustic) * smoothstep(1.2, 0.4, radial);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  disposables.push(waterMat);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -8;
  water.receiveShadow = true;
  scene.add(water);

  // Soft caustic glow planes under course
  const glowPlanes: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const gMat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? Palette.teal : Palette.lime,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    disposables.push(gMat);
    const gGeo = new THREE.PlaneGeometry(14, 14);
    disposables.push(gGeo);
    const g = new THREE.Mesh(gGeo, gMat);
    g.rotation.x = -Math.PI / 2;
    g.position.set((i - 3.5) * 20, -7.65, ((i % 3) - 1) * 35 - 40);
    scene.add(g);
    glowPlanes.push(g);
  }

  const followTmp = new THREE.Vector3();
  const shadowCenter = new THREE.Vector3(0, 0, -60);

  return {
    sun,
    hemi,
    water,
    update(t: number, follow?: THREE.Vector3) {
      skyMat.uniforms.time!.value = t;
      waterMat.uniforms.time!.value = t;

      // Shadow frustum tracks player so contact shadows stay sharp
      if (follow) {
        shadowCenter.lerp(
          followTmp.set(follow.x, 0, follow.z),
          0.08,
        );
        sun.target.position.set(shadowCenter.x, 0, shadowCenter.z);
        sun.position.set(
          shadowCenter.x + 48,
          72,
          shadowCenter.z + 18,
        );
        sun.target.updateMatrixWorld();
      }

      const pos = confetti.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < confettiCount; i++) {
        const spd = speeds[i]!;
        const ph = phases[i]!;
        let y = pos.getY(i) - 0.012 * spd * (1 + (i % 5) * 0.15);
        let x = pos.getX(i) + Math.sin(t * 0.7 + ph) * 0.008 * spd;
        let z = pos.getZ(i) + Math.cos(t * 0.55 + ph) * 0.006;
        if (y < 1.5) {
          y = 62 + Math.random() * 12;
          x = (Math.random() - 0.5) * 200;
          z = (Math.random() - 0.5) * 260 - 40;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      confettiMat.size = 0.42 + Math.sin(t * 2.2) * 0.04;

      const sp = sparkles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sparkleCount; i++) {
        const ph = sPhase[i]!;
        let y = sp.getY(i) + Math.sin(t * 1.2 + ph) * 0.01;
        let x = sp.getX(i) + Math.cos(t * 0.9 + ph) * 0.012;
        if (y < 0.5 || y > 32) y = 2 + Math.random() * 24;
        sp.setXYZ(i, x, y, sp.getZ(i));
      }
      sp.needsUpdate = true;
      sparkleMat.opacity = 0.45 + Math.sin(t * 2.8) * 0.25;
      sparkleMat.size = 0.7 + Math.sin(t * 4.1) * 0.18;

      ringGroup.rotation.y = t * 0.045;
      hazeGroup.rotation.y = -t * 0.02;
      for (let i = 0; i < glowPlanes.length; i++) {
        const mat = glowPlanes[i]!.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.035 + Math.sin(t * 1.4 + i * 0.9) * 0.028;
        glowPlanes[i]!.scale.setScalar(1 + Math.sin(t * 0.8 + i) * 0.08);
      }
      water.position.y = -8 + Math.sin(t * 0.65) * 0.1;
    },
    dispose() {
      scene.remove(sky, ringGroup, hazeGroup, confetti, sparkles, water);
      scene.remove(hemi, sun, sun.target, fill, rim, bounce);
      for (const g of glowPlanes) {
        scene.remove(g);
      }
      for (const d of disposables) d.dispose();
    },
  };
}
