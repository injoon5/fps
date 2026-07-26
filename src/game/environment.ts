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

/** Soft vertical shaft for fake god-rays (additive). */
function makeGodRayTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(64, 0, 64, 256);
  g.addColorStop(0, "rgba(255,236,190,0)");
  g.addColorStop(0.12, "rgba(255,230,170,0.55)");
  g.addColorStop(0.45, "rgba(255,210,140,0.22)");
  g.addColorStop(1, "rgba(255,180,100,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  const soft = ctx.createRadialGradient(64, 128, 8, 64, 128, 64);
  soft.addColorStop(0, "rgba(255,245,210,0.5)");
  soft.addColorStop(1, "rgba(255,245,210,0)");
  ctx.globalCompositeOperation = "destination-in";
  // Keep vertical falloff; horizontal soft edge via second pass
  ctx.globalCompositeOperation = "source-over";
  const edge = ctx.createLinearGradient(0, 0, 128, 0);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(0.35, "rgba(0,0,0,1)");
  edge.addColorStop(0.65, "rgba(0,0,0,1)");
  edge.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 128, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Stadium sky, layered void haze, mirror water, god-rays, confetti + sparkles. */
export function buildEnvironment(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  water: THREE.Mesh;
  update: (t: number, follow?: THREE.Vector3) => void;
  dispose: () => void;
} {
  const disposables: Array<{ dispose: () => void }> = [];

  scene.background = null;
  scene.fog = new THREE.Fog(0xffb070, 62, 270);

  // Keep hemi very low — FP contact shadows on lime pad + pink bridge must punch
  const hemi = new THREE.HemisphereLight(Palette.skyTop, Palette.deepTeal, 0.035);
  scene.add(hemi);

  // Sun from upper-right / slightly behind spawn so looking down-course (-Z)
  // you get crisp pad contact shadows stretching across lime + pink bridge
  const sun = new THREE.DirectionalLight(0xfff0d4, 2.55);
  const sunOffset = new THREE.Vector3(78, 62, 42);
  sun.position.set(sunOffset.x, sunOffset.y, CourseBounds.zCenter + sunOffset.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 380;
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  // Hard contacts — low radius, tight bias
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.018;
  sun.shadow.radius = 0.2;
  sun.target.position.set(0, 0.4, CourseBounds.zCenter);
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(Palette.teal, 0.04);
  fill.position.set(-42, 14, -22);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(Palette.hot, 0.04);
  rim.position.set(8, 9, -60);
  scene.add(rim);

  const bounce = new THREE.DirectionalLight(Palette.sun, 0.02);
  bounce.position.set(0, -18, -35);
  scene.add(bounce);

  // ——— Gradient sky dome ———
  const skyGeo = new THREE.SphereGeometry(380, 64, 32);
  disposables.push(skyGeo);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(Palette.skyTop) },
      midColor: { value: new THREE.Color(0xff9a58) },
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

        float horizon = exp(-pow(h * 4.5, 2.0));
        col = mix(col, hazeColor * 1.12, horizon * 0.42);

        float sunDot = max(dot(dir, sunDir), 0.0);
        float disc = pow(sunDot, 420.0);
        float corona = pow(sunDot, 28.0);
        float glow = pow(sunDot, 6.0);
        // Keep sky LDR so bloom doesn't white-flash when looking near the sun
        col += vec3(1.0, 0.94, 0.78) * disc * 0.55;
        col += vec3(1.0, 0.82, 0.5) * corona * 0.22;
        col += vec3(1.0, 0.72, 0.42) * glow * 0.1;
        col = min(col, vec3(1.35));

        float grain = hash(dir.xz * 80.0 + time * 0.01);
        col += vec3(grain) * 0.02 * smoothstep(0.2, 0.9, h);

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
      roughness: 0.42,
      metalness: 0.28,
      emissive: i % 2 === 0 ? Palette.hot : Palette.lime,
      emissiveIntensity: 0.22,
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

  // ——— Fake volumetric god-rays toward sun ———
  const godRayTex = makeGodRayTexture();
  disposables.push(godRayTex);
  const godRayGroup = new THREE.Group();
  const godRays: THREE.Mesh[] = [];
  const sunDirN = sunOffset.clone().normalize();
  for (let i = 0; i < 9; i++) {
    const rayMat = new THREE.MeshBasicMaterial({
      map: godRayTex,
      color: i % 2 === 0 ? 0xffe8b8 : 0xffd090,
      transparent: true,
      opacity: 0.04 + (i % 3) * 0.012,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    disposables.push(rayMat);
    const w = 6 + (i % 4) * 3.5;
    const h = 28 + (i % 5) * 10;
    const rayGeo = new THREE.PlaneGeometry(w, h);
    disposables.push(rayGeo);
    const ray = new THREE.Mesh(rayGeo, rayMat);
    // Fan along course, angled toward sun
    const along = -8 - i * 18;
    const side = ((i % 3) - 1) * 7;
    ray.position.set(side + sunDirN.x * 12, 10 + (i % 4) * 2.5, along);
    ray.lookAt(
      ray.position.x + sunDirN.x * 40,
      ray.position.y + sunDirN.y * 40,
      ray.position.z + sunDirN.z * 40,
    );
    ray.renderOrder = -50;
    godRayGroup.add(ray);
    godRays.push(ray);
  }
  scene.add(godRayGroup);

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

  // ——— Sparkles ———
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

  // Shared water fragment bits — mirror probe fake + animated specular
  const waterVert = /* glsl */ `
    uniform float time;
    uniform float waveAmp;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying float vWave;
    void main() {
      vUv = uv;
      vec3 p = position;
      float w1 = sin(p.x * 0.09 + time * 1.05) * waveAmp;
      float w2 = cos(p.y * 0.13 + time * 1.35) * waveAmp * 0.65;
      float w3 = sin((p.x + p.y) * 0.05 + time * 0.7) * waveAmp * 0.45;
      p.z += w1 + w2 + w3;
      vWave = w1 + w2;
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorldPos = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;

  const waterFrag = /* glsl */ `
    uniform float time;
    uniform vec3 deepColor;
    uniform vec3 waterColor;
    uniform vec3 foamColor;
    uniform vec3 glintColor;
    uniform vec3 horizonColor;
    uniform vec3 skyTopColor;
    uniform vec3 sunDir;
    uniform float opacityScale;
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
      vec3 col = mix(waterColor * 1.2, deepColor, smoothstep(0.22, 1.05, radial) * 0.78);
      col += foamColor * caustic * 0.48;
      col += foamColor * (0.05 + vWave * 0.4);
      col += waterColor * n3 * 0.1;

      // Fake reflection probe: view-dependent sky mirror
      vec3 nrm = normalize(vec3((n1 - 0.5) * 1.55, 0.68, (n2 - 0.5) * 1.55));
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      vec3 refl = reflect(-viewDir, nrm);
      float skyT = clamp(refl.y * 0.55 + 0.48, 0.0, 1.0);
      vec3 skyCol = mix(horizonColor, skyTopColor, skyT);
      skyCol = mix(skyCol, glintColor, pow(max(dot(refl, sunDir), 0.0), 12.0) * 0.55);
      float fresnel = pow(1.0 - max(dot(nrm, viewDir), 0.0), 3.2);
      col = mix(col, skyCol, fresnel * 0.62);

      // Soft specular only — hard sparks blow bloom into white frames
      float glint = pow(max(dot(nrm, sunDir), 0.0), 48.0);
      float band = pow(max(sin(vWorldPos.x * 0.35 + vWorldPos.z * 0.22 + time * 1.8), 0.0), 18.0);
      col += glintColor * glint * 0.35;
      col += glintColor * band * fresnel * 0.18;
      col = min(col, vec3(1.25));

      float alpha = mix(0.9, 0.68, caustic) * smoothstep(1.25, 0.32, radial) * opacityScale;
      gl_FragColor = vec4(col, alpha);
    }
  `;

  // ——— Primary water ———
  const waterGeo = new THREE.CircleGeometry(220, 96);
  disposables.push(waterGeo);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      waveAmp: { value: 0.22 },
      deepColor: { value: new THREE.Color(0x010a10) },
      waterColor: { value: new THREE.Color(0x085868) },
      foamColor: { value: new THREE.Color(0xb8efe4) },
      glintColor: { value: new THREE.Color(0xfff6d8) },
      horizonColor: { value: new THREE.Color(Palette.skyHorizon) },
      skyTopColor: { value: new THREE.Color(Palette.skyTop) },
      sunDir: { value: sunOffset.clone().normalize() },
      opacityScale: { value: 0.82 },
    },
    vertexShader: waterVert,
    fragmentShader: waterFrag,
  });
  disposables.push(waterMat);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -8;
  water.receiveShadow = false;
  scene.add(water);

  // Second translucent skim layer — parallax sheen
  const skimGeo = new THREE.CircleGeometry(200, 64);
  disposables.push(skimGeo);
  const skimMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      waveAmp: { value: 0.12 },
      deepColor: { value: new THREE.Color(0x042830) },
      waterColor: { value: new THREE.Color(0x2ec4d8) },
      foamColor: { value: new THREE.Color(0xffffff) },
      glintColor: { value: new THREE.Color(0xffe8b0) },
      horizonColor: { value: new THREE.Color(0xffb070) },
      skyTopColor: { value: new THREE.Color(0x6ad0ff) },
      sunDir: { value: sunOffset.clone().normalize() },
      opacityScale: { value: 0.22 },
    },
    vertexShader: waterVert,
    fragmentShader: waterFrag,
  });
  disposables.push(skimMat);
  const waterSkim = new THREE.Mesh(skimGeo, skimMat);
  waterSkim.rotation.x = -Math.PI / 2;
  waterSkim.position.y = -7.72;
  waterSkim.renderOrder = 1;
  scene.add(waterSkim);

  // Shadow catcher ABOVE skim so contact shadows aren't washed by additive water
  const catcherGeo = new THREE.PlaneGeometry(320, 320);
  disposables.push(catcherGeo);
  const catcherMat = new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: 1.0,
  });
  disposables.push(catcherMat);
  const shadowCatcher = new THREE.Mesh(catcherGeo, catcherMat);
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -7.55;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const glowPlanes: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const gMat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? Palette.teal : Palette.lime,
      transparent: true,
      opacity: 0.03,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    disposables.push(gMat);
    const gGeo = new THREE.PlaneGeometry(16, 16);
    disposables.push(gGeo);
    const g = new THREE.Mesh(gGeo, gMat);
    g.rotation.x = -Math.PI / 2;
    g.position.set((i - 2.5) * 22, -7.48, -20 - i * 28);
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
      skimMat.uniforms.time!.value = t * 1.15;

      sun.target.position.set(0, 0.4, CourseBounds.zCenter);
      sun.position.set(sunOffset.x, sunOffset.y, CourseBounds.zCenter + sunOffset.z);
      sun.target.updateMatrixWorld();

      // Breath god-rays
      for (let i = 0; i < godRays.length; i++) {
        const ray = godRays[i]!;
        const mat = ray.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.045 + Math.sin(t * 0.7 + i * 0.85) * 0.02 + (i % 3) * 0.01;
        ray.scale.setScalar(1 + Math.sin(t * 0.45 + i) * 0.06);
        ray.rotation.z = Math.sin(t * 0.2 + i * 0.4) * 0.04;
      }

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
      sparkleMat.opacity = 0.35 + Math.sin(t * 2.8) * 0.08;
      sparkleMat.size = 0.7 + Math.sin(t * 4.1) * 0.1;

      ringGroup.rotation.y = t * 0.045;
      hazeGroup.rotation.y = -t * 0.02;
      for (let i = 0; i < glowPlanes.length; i++) {
        const mat = glowPlanes[i]!.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.04 + Math.sin(t * 1.4 + i * 0.9) * 0.032;
        glowPlanes[i]!.scale.setScalar(1 + Math.sin(t * 0.8 + i) * 0.08);
      }
      water.position.y = -8 + Math.sin(t * 0.65) * 0.1;
      waterSkim.position.y = -7.72 + Math.sin(t * 0.9 + 1.2) * 0.06;
      waterSkim.rotation.z = Math.sin(t * 0.15) * 0.02;
    },
    dispose() {
      scene.remove(
        sky,
        ringGroup,
        hazeGroup,
        godRayGroup,
        confetti,
        sparkles,
        water,
        waterSkim,
        shadowCatcher,
      );
      scene.remove(hemi, sun, sun.target, fill, rim, bounce);
      for (const g of glowPlanes) {
        scene.remove(g);
      }
      for (const d of disposables) d.dispose();
    },
  };
}
