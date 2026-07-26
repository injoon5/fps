/**
 * Procedural audio — fluorescent hum, footsteps, gunfire, entity drones.
 * No external assets; Web Audio API only.
 */

import type { LevelId } from "../types";

export interface AudioDirector {
  resume: () => Promise<void>;
  setLevel: (id: LevelId) => void;
  setMoving: (moving: boolean, sprinting: boolean) => void;
  playGunshot: () => void;
  playReload: () => void;
  playHurt: () => void;
  playEntityNear: (intensity: number) => void;
  dispose: () => void;
}

export function createAudioDirector(): AudioDirector {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();

  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // Fluorescent hum bed
  const humOsc = ctx.createOscillator();
  const humGain = ctx.createGain();
  const humFilter = ctx.createBiquadFilter();
  humOsc.type = "sawtooth";
  humOsc.frequency.value = 120;
  humFilter.type = "lowpass";
  humFilter.frequency.value = 280;
  humGain.gain.value = 0.028;
  humOsc.connect(humFilter);
  humFilter.connect(humGain);
  humGain.connect(master);
  humOsc.start();

  const hum2 = ctx.createOscillator();
  const hum2Gain = ctx.createGain();
  hum2.type = "sine";
  hum2.frequency.value = 60;
  hum2Gain.gain.value = 0.02;
  hum2.connect(hum2Gain);
  hum2Gain.connect(master);
  hum2.start();

  // Unease drone
  const drone = ctx.createOscillator();
  const droneGain = ctx.createGain();
  drone.type = "triangle";
  drone.frequency.value = 42;
  droneGain.gain.value = 0.0;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start();

  let footTimer = 0;
  let moving = false;
  let sprinting = false;
  let disposed = false;

  const resume = async (): Promise<void> => {
    if (ctx.state === "suspended") await ctx.resume();
  };

  const setLevel = (id: LevelId): void => {
    switch (id) {
      case "backrooms":
        humOsc.frequency.setTargetAtTime(118, ctx.currentTime, 0.2);
        humFilter.frequency.setTargetAtTime(260, ctx.currentTime, 0.2);
        humGain.gain.setTargetAtTime(0.032, ctx.currentTime, 0.3);
        break;
      case "mart":
        humOsc.frequency.setTargetAtTime(140, ctx.currentTime, 0.2);
        humFilter.frequency.setTargetAtTime(420, ctx.currentTime, 0.2);
        humGain.gain.setTargetAtTime(0.024, ctx.currentTime, 0.3);
        break;
      case "hotel":
        humOsc.frequency.setTargetAtTime(90, ctx.currentTime, 0.2);
        humFilter.frequency.setTargetAtTime(200, ctx.currentTime, 0.2);
        humGain.gain.setTargetAtTime(0.016, ctx.currentTime, 0.3);
        break;
      case "poolrooms":
        humOsc.frequency.setTargetAtTime(160, ctx.currentTime, 0.2);
        humFilter.frequency.setTargetAtTime(500, ctx.currentTime, 0.2);
        humGain.gain.setTargetAtTime(0.02, ctx.currentTime, 0.3);
        break;
      case "office":
        humOsc.frequency.setTargetAtTime(125, ctx.currentTime, 0.2);
        humFilter.frequency.setTargetAtTime(340, ctx.currentTime, 0.2);
        humGain.gain.setTargetAtTime(0.03, ctx.currentTime, 0.3);
        break;
      case "garage":
        humOsc.frequency.setTargetAtTime(70, ctx.currentTime, 0.2);
        humFilter.frequency.setTargetAtTime(180, ctx.currentTime, 0.2);
        humGain.gain.setTargetAtTime(0.018, ctx.currentTime, 0.3);
        break;
      case "playplace":
        humOsc.frequency.setTargetAtTime(105, ctx.currentTime, 0.2);
        humFilter.frequency.setTargetAtTime(380, ctx.currentTime, 0.2);
        humGain.gain.setTargetAtTime(0.022, ctx.currentTime, 0.3);
        break;
      default: {
        const _n: never = id;
        void _n;
      }
    }
  };

  const blip = (
    freq: number,
    dur: number,
    type: OscillatorType,
    gainVal: number,
    filterFreq?: number,
  ): void => {
    if (disposed) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gainVal;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    if (filterFreq !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = filterFreq;
      f.Q.value = 0.7;
      o.connect(f);
      f.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  };

  const noiseBurst = (dur: number, gainVal: number): void => {
    if (disposed) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 800;
    g.gain.value = gainVal;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  };

  const playGunshot = (): void => {
    noiseBurst(0.12, 0.45);
    blip(90, 0.08, "square", 0.2, 400);
    blip(40, 0.15, "sawtooth", 0.12);
  };

  const playReload = (): void => {
    blip(220, 0.05, "square", 0.06);
    setTimeout(() => blip(160, 0.08, "triangle", 0.05), 180);
    setTimeout(() => blip(280, 0.04, "square", 0.07), 900);
  };

  const playHurt = (): void => {
    blip(70, 0.2, "sawtooth", 0.15, 200);
    noiseBurst(0.15, 0.2);
  };

  const playEntityNear = (intensity: number): void => {
    const t = Math.max(0, Math.min(1, intensity));
    droneGain.gain.setTargetAtTime(t * 0.045, ctx.currentTime, 0.4);
    drone.frequency.setTargetAtTime(36 + t * 28, ctx.currentTime, 0.5);
  };

  const setMoving = (isMoving: boolean, isSprinting: boolean): void => {
    moving = isMoving;
    sprinting = isSprinting;
  };

  // Footstep ticker via rAF-independent interval from game calling update — expose tick
  const footInterval = window.setInterval(() => {
    if (!moving || disposed || ctx.state !== "running") return;
    footTimer += 1;
    const every = sprinting ? 2 : 3;
    if (footTimer % every !== 0) return;
    blip(sprinting ? 95 : 80, 0.04, "triangle", sprinting ? 0.045 : 0.03, 180);
  }, 120);

  const dispose = (): void => {
    disposed = true;
    window.clearInterval(footInterval);
    try {
      humOsc.stop();
      hum2.stop();
      drone.stop();
      void ctx.close();
    } catch {
      /* already closed */
    }
  };

  return {
    resume,
    setLevel,
    setMoving,
    playGunshot,
    playReload,
    playHurt,
    playEntityNear,
    dispose,
  };
}
