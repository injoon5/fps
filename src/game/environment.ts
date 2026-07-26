import * as THREE from "three";
import { Palette } from "./config";

/** Stadium sky, volumetric sun shafts feel via layered meshes, water void. */
export function buildEnvironment(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  water: THREE.Mesh;
  update: (t: number) => void;
  dispose: () => void;
} {
  const hemi = new THREE.HemisphereLight(Palette.skyTop, Palette.deepTeal, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
  sun.position.set(48, 72, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(Palette.teal, 0.55);
  fill.position.set(-40, 20, -30);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(Palette.hot, 0.35);
  rim.position.set(10, 8, -50);
  scene.add(rim);

  // Gradient sky dome
  const skyGeo = new THREE.SphereGeometry(380, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(Palette.skyTop) },
      midColor: { value: new THREE.Color(0xffd4a8) },
      bottomColor: { value: new THREE.Color(Palette.skyHorizon) },
      offset: { value: 12 },
      exponent: { value: 0.7 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos + vec3(0.0, offset, 0.0)).y;
        float t = max(pow(max(h, 0.0), exponent), 0.0);
        vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.45, t));
        col = mix(col, topColor, smoothstep(0.35, 1.0, t));
        // soft sun glow
        float sun = pow(max(dot(normalize(vWorldPos), normalize(vec3(0.35, 0.55, 0.2))), 0.0), 28.0);
        col += vec3(1.0, 0.85, 0.55) * sun * 0.65;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Distant stadium rings
  const ringGroup = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(55 + i * 18, 1.2, 12, 96),
      new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? Palette.hot : Palette.lime,
        roughness: 0.4,
        metalness: 0.2,
        emissive: i % 2 === 0 ? Palette.hot : Palette.lime,
        emissiveIntensity: 0.2,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -4 + i * 2.5;
    ring.castShadow = true;
    ringGroup.add(ring);
  }
  scene.add(ringGroup);

  // Confetti particles in distance
  const confettiCount = 400;
  const confettiGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(confettiCount * 3);
  const colors = new Float32Array(confettiCount * 3);
  const palette = [
    new THREE.Color(Palette.lime),
    new THREE.Color(Palette.hot),
    new THREE.Color(Palette.sun),
    new THREE.Color(Palette.teal),
    new THREE.Color(Palette.platformAlt),
  ];
  for (let i = 0; i < confettiCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 180;
    positions[i * 3 + 1] = Math.random() * 60 + 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 220;
    const c = palette[i % palette.length]!;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  confettiGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  confettiGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const confetti = new THREE.Points(
    confettiGeo,
    new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  scene.add(confetti);

  // Water void below course
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(200, 64),
    new THREE.MeshStandardMaterial({
      color: Palette.water,
      roughness: 0.12,
      metalness: 0.4,
      transparent: true,
      opacity: 0.9,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -8;
  water.receiveShadow = true;
  scene.add(water);

  // Soft caustic-ish plane flicker via emissive pulse handled in update
  const glowPlanes: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshBasicMaterial({
        color: Palette.teal,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set((i - 2.5) * 22, -7.7, (i % 2) * 30 - 20);
    scene.add(g);
    glowPlanes.push(g);
  }

  return {
    sun,
    hemi,
    water,
    update(t: number) {
      confetti.rotation.y = t * 0.02;
      const pos = confetti.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < confettiCount; i++) {
        let y = pos.getY(i) - 0.015 * (1 + (i % 5) * 0.2);
        if (y < 2) y = 65;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      ringGroup.rotation.y = t * 0.05;
      for (let i = 0; i < glowPlanes.length; i++) {
        const mat = glowPlanes[i]!.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.04 + Math.sin(t * 1.5 + i) * 0.03;
      }
      water.position.y = -8 + Math.sin(t * 0.7) * 0.08;
    },
    dispose() {
      skyGeo.dispose();
      skyMat.dispose();
      confettiGeo.dispose();
      (confetti.material as THREE.Material).dispose();
    },
  };
}
