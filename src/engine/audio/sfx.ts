// Synthesised sound effects (no audio files; plan §1). Created on the first user gesture.

export class Sfx {
  private ctx: AudioContext | null = null;

  init(): void {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
  }

  private tone(freq: number, start: number, duration: number, gain: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const t = ctx.currentTime + start;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    } catch {
      // Audio is optional feedback; ignore failures.
    }
  }

  chime(): void {
    this.tone(880, 0, 1.1, 0.12);
    this.tone(1318.5, 0.08, 1.0, 0.09);
    this.tone(1760, 0.16, 0.9, 0.06);
  }

  fanfare(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, i * 0.12, 1.4, 0.1, 'triangle'));
  }

  sealed(): void {
    this.tone(196, 0, 0.5, 0.08, 'triangle');
    this.tone(185, 0.12, 0.6, 0.06, 'triangle');
  }

  whoosh(up: boolean): void {
    this.tone(up ? 330 : 440, 0, 0.35, 0.05, 'sawtooth');
    this.tone(up ? 440 : 330, 0.12, 0.3, 0.04, 'sawtooth');
  }
}
