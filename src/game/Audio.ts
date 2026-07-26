/** Tiny procedural Web Audio juice — no asset downloads required. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicNodes: AudioNode[] = [];
  private started = false;

  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.18;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startMusic();
    }
  }

  jump(): void {
    this.blip(480, 140, 0.07, "square", 0.1);
    window.setTimeout(() => this.blip(220, 90, 0.05, "triangle", 0.05), 28);
  }

  land(impact = 6): void {
    const t = Math.min(Math.max(impact / 12, 0.35), 1);
    this.blip(140 - t * 40, 55, 0.05 + t * 0.04, "triangle", 0.08 + t * 0.07);
    if (t > 0.55) {
      window.setTimeout(
        () => this.blip(90, 40, 0.08, "sawtooth", 0.04 + t * 0.04),
        20,
      );
    }
  }

  checkpoint(): void {
    this.blip(520, 780, 0.16, "sine", 0.1);
    window.setTimeout(() => this.blip(780, 1040, 0.18, "sine", 0.08), 90);
  }

  fall(): void {
    this.blip(300, 60, 0.35, "sawtooth", 0.1);
  }

  finish(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => {
      window.setTimeout(() => this.blip(n, n * 1.02, 0.22, "sine", 0.12), i * 110);
    });
  }

  dispose(): void {
    for (const n of this.musicNodes) n.disconnect();
    void this.ctx?.close();
    this.ctx = null;
  }

  private blip(
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const base = 98;
    const intervals = [0, 3, 5, 7, 10];

    const pulse = ctx.createOscillator();
    pulse.type = "triangle";
    pulse.frequency.value = base;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.35;
    pulse.connect(pulseGain);
    pulseGain.connect(this.musicGain);
    pulse.start();
    this.musicNodes.push(pulse, pulseGain);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain);
    lfoGain.connect(pulse.frequency);
    lfo.start();
    this.musicNodes.push(lfo, lfoGain);

    intervals.forEach((semi, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = base * Math.pow(2, semi / 12) * 2;
      const g = ctx.createGain();
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(this.musicGain!);
      o.start();
      this.musicNodes.push(o, g);

      const trem = ctx.createOscillator();
      trem.frequency.value = 0.2 + i * 0.07;
      const tg = ctx.createGain();
      tg.gain.value = 0.05;
      trem.connect(tg);
      tg.connect(g.gain);
      trem.start();
      this.musicNodes.push(trem, tg);
    });
  }
}
