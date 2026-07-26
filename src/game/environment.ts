import * as THREE from "three";
import { CourseBounds, Palette } from "./config";

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

  // Linear fog (matches RendererPipeline) — mid-course readable, sky not washed
  scene.background = null;
  scene.fog = new THREE.Fog(Palette.skyHorizon, 42, 220);

  // Lower hemi so directional shadows actually read on pads
  const hemi = new THREE.HemisphereLight(Palette.skyTop, Palette.deepTeal, 0.48);
  scene.add(hemi);

  // Fixed course-wide soft shadows: cover z≈10 → −210 along the gauntlet
  const sun = new THREE.DirectionalLight(0xffe8c8, 3.15);
  const sunOffset = new THREE.Vector3(56, 88, 42);
  sun.position.set(sunOffset.x, sunOffset.y, CourseBounds.zCenter + sunOffset.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 320;
  // Ortho frustum sized for full course length in light space
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3.2;
  sun.target.position.set(0, 0, CourseBounds.zCenter);
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  // Soft bounce fill — teal from below/side for contact read on jelly
  const fill = new THREE.DirectionalLight(Palette.teal, 0.28);
  fill.position.set(-38, 16, -28);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(Palette.hot, 0.22);
  rim.position.set(12, 10, -55);
  scene.add(rim);

  // Warm ground bounce so underside of platforms aren't pure black
  const bounce = new THREE.DirectionalLight(Palette.sun, 0.16);
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
      midColor: { value: new THREE.Color(0xffc090) },
      bottomColor: { value: new THREE.Color(Palette.deepTeal) },
      hazeColor: { value: new THREE.Color(Palette.skyHorizon) },
      sunDir: { value: sunOffset.clone().normalize() },
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

        // Soft horizon band — keep saturation so sky isn't washed milk
        float horizon = exp(-pow(h * 4.5, 2.0));
        col = mix(col, hazeColor * 1.12, horizon * 0.42);

        // Sun disc + corona
        float sunDot = max(dot(dir, sunDir), 0.0);
        float disc = pow(sunDot, 380.0);
        float corona = pow(sunDot, 16.0);
        float glow = pow(sunDot, 4.0);
        col += vec3(1.0, 0.94, 0.78) * disc * 2.6;
        col += vec3(1.0, 0.8, 0.48) * corona * 1.05;
        col += vec3(1.0, 0.72, 0.42) * glow * 0.38;

        // Subtle atmospheric grain (cheap stars / dust)
        float grain = hash(dir.xz * 80.0 + time * 0.01);
        col += vec3(grain) * 0.03 * smoothstep(0.2, 0.9, h);

        // Lower void vignette into deep teal
        col = mix(col, bottomColor, smoothstep(0.05, -0.55, h) * 0.55);

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
      roughness: 0.32,
      metalness: 0.35,
      emissive: i % 2 === 0 ? Palette.hot : Palette.lime,
      emissiveIntensity: 0.55,
    });
    disposables.push(ringMat);
    const ringGeo = new THREE.TorusGeometry(52 + i * 20, 1.05 + i * 0.1, 12, 112);
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
      opacity: 0.04,
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
  const confettiCount = 920;
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
    size: 0.58,
    map: confettiTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.08,
  });
  disposables.push(confettiMat);
  const confetti = new THREE.Points(confettiGeo, confettiMat);
  confetti.frustumCulled = false;
  scene.add(confetti);

  // ——— Sparkles (additive twinkles) ———
  const sparkleCount = 420;
  const sparkleGeo = new THREE.BufferGeometry();
  disposables.push(sparkleGeo);
  const sPos = new Float32Array(sparkleCount * 3);
  const sCol = new Float32Array(sparkleCount * 3);
  const sPhase = new Float32Array(sparkleCount);
  for (let i = 0; i < sparkleCount; i++) {
    sPos[i * 3] = (Math.random() - 0.5) * 140;
    sPos[i * 3 + 1] = Math.random() * 32 + 1;
    sPos[i * 3 + 2] = (Math.random() - 0.5) * 220 - 30;
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
    size: 1.15,
    map: sparkleTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  disposables.push(sparkleMat);
  const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
  sparkles.frustumCulled = false;
  scene.add(sparkles);

  // ——— Clearer water void with hard specular glints ———
  const waterGeo = new THREE.CircleGeometry(220, 96);
  disposables.push(waterGeo);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      deepColor: { value: new THREE.Color(Palette.void) },
      waterColor: { value: new THREE.Color(0x1490a8) },
      foamColor: { value: new THREE.Color(Palette.foam) },
      glintColor: { value: new THREE.Color(0xfff2c8) },
      sunDir: { value: sunOffset.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w1 = sin(p.x * 0.09 + time * 1.05) * 0.22;
        float w2 = cos(p.y * 0.13 + time * 1.35) * 0.14;
        float w3 = sin((p.x + p.y) * 0.05 + time * 0.7) * 0.1;
        p.z += w1 + w2 + w3;
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
      uniform vec3 glintColor;
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
        vec2 uv = vWorldPos.xz * 0.028;
        float n1 = noise(uv * 2.8 + time * 0.18);
        float n2 = noise(uv * 8.5 - time * 0.28);
        float n3 = noise(uv * 18.0 + time * 0.4);
        float caustic = pow(n1 * n2 * 1.75, 1.85);

        float radial = length(vUv - 0.5) * 2.0;
        // Clearer turquoise — less muddy void mix
        vec3 col = mix(waterColor * 1.15, deepColor, smoothstep(0.25, 1.1, radial) * 0.72);
        col += foamColor * caustic * 0.55;
        col += foamColor * (0.06 + vWave * 0.35);
        col += waterColor * n3 * 0.12;

        // Specular sun glints — sharp sparkles on wave normals
        vec3 nrm = normalize(vec3((n1 - 0.5) * 1.4, 0.72, (n2 - 0.5) * 1.4));
        float glint = pow(max(dot(nrm, sunDir), 0.0), 72.0);
        float spark = pow(max(dot(nrm, sunDir), 0.0), 220.0);
        col += glintColor * glint * 0.95;
        col += vec3(1.0) * spark * 1.4;

        float alpha = mix(0.88, 0.7, caustic) * smoothstep(1.25, 0.35, radial);
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
  for (let i = 0; i < 10; i++) {
    const gMat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? Palette.teal : Palette.lime,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    disposables.push(gMat);
    const gGeo = new THREE.PlaneGeometry(16, 16);
    disposables.push(gGeo);
    const g = new THREE.Mesh(gGeo, gMat);
    g.rotation.x = -Math.PI / 2;
    g.position.set((i - 4.5) * 18, -7.65, -20 - i * 18);
    scene.add(g);
    glowPlanes.push(g);
  }

  return {
    sun,
    hemi,
    water,
    update(t: number, _follow?: THREE.Vector3) {
      skyMat.uniforms.time!.value = t;
      waterMat.uniforms.time!.value = t;

      // Keep shadow frustum locked on full course (z 10 → −210) — do not chase player
      sun.target.position.set(0, 0, CourseBounds.zCenter);
      sun.position.set(sunOffset.x, sunOffset.y, CourseBounds.zCenter + sunOffset.z);
      sun.target.updateMatrixWorld();

      const posAttr = confetti.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < confettiCount; i++) {
        const spd = speeds[i]!;
        const ph = phases[i]!;
        let y = posAttr.getY(i) - 0.012 * spd * (1 + (i % 5) * 0.15);
        let x = posAttr.getX(i) + Math.sin(t * 0.7 + ph) * 0.008 * spd;
        let z = posAttr.getZ(i) + Math.cos(t * 0.55 + ph) * 0.006;
        if (y < 1.5) {
          y = 62 + Math.random() * 12;
          x = (Math.random() - 0.5) * 200;
          z = (Math.random() - 0.5) * 260 - 40;
        }
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
      confettiMat.size = 0.5 + Math.sin(t * 2.2) * 0.06;

      const sp = sparkles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sparkleCount; i++) {
        const ph = sPhase[i]!;
        let y = sp.getY(i) + Math.sin(t * 1.2 + ph) * 0.012;
        let x = sp.getX(i) + Math.cos(t * 0.9 + ph) * 0.014;
        if (y < 0.5 || y > 34) y = 2 + Math.random() * 26;
        sp.setXYZ(i, x, y, sp.getZ(i));
      }
      sp.needsUpdate = true;
      sparkleMat.opacity = 0.55 + Math.sin(t * 2.8) * 0.3;
      sparkleMat.size = 0.95 + Math.sin(t * 4.1) * 0.28;

      ringGroup.rotation.y = t * 0.045;
      hazeGroup.rotation.y = -t * 0.02;
      for (let i = 0; i < glowPlanes.length; i++) {
        const mat = glowPlanes[i]!.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.04 + Math.sin(t * 1.4 + i * 0.9) * 0.032;
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
