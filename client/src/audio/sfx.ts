/**
 * 효과음. 음원 파일 없이 Web Audio 로 합성한다 (번들이 가볍고 저작권 걱정이 없다).
 * 브라우저 · 웹뷰는 사용자가 처음 터치한 뒤에야 소리를 낼 수 있어서 그때 오디오를 연다
 */
export type SfxName = 'hit' | 'crit' | 'hurt' | 'heavy' | 'kill' | 'coin' | 'level' | 'evolve' | 'clear' | 'fail' | 'boss' | 'buy' | 'tap' | 'ally' | 'summon' | 'legendary';

/** 같은 소리가 너무 촘촘히 겹치지 않게 (배속 ×3 의 타격음 등) */
const MIN_GAP_MS: Partial<Record<SfxName, number>> = { hit: 70, crit: 90, hurt: 90, coin: 60, tap: 40, ally: 90 };

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private suspended = false;
  private readonly last = new Map<SfxName, number>();

  constructor() {
    const unlock = () => {
      this.open();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyVolume();
  }

  /** 광고 재생 중 등 잠시 멈춘다 */
  setSuspended(on: boolean): void {
    this.suspended = on;
    this.applyVolume();
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled || this.suspended || ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? -1e9) < (MIN_GAP_MS[name] ?? 0)) return;
    this.last.set(name, now);
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'hit':
        this.noiseBurst(t, 0.05, 1800, 0.28);
        this.tone(t, 'sine', 220, 110, 0.07, 0.3);
        break;
      case 'crit':
        this.noiseBurst(t, 0.07, 2600, 0.32);
        this.tone(t, 'sine', 260, 120, 0.09, 0.35);
        this.tone(t + 0.02, 'triangle', 1320, 1760, 0.12, 0.16);
        break;
      case 'hurt':
        this.noiseBurst(t, 0.06, 700, 0.22);
        this.tone(t, 'sine', 150, 80, 0.1, 0.3);
        break;
      case 'heavy':
        this.noiseBurst(t, 0.14, 500, 0.4);
        this.tone(t, 'sawtooth', 110, 50, 0.22, 0.28);
        break;
      case 'kill':
        this.tone(t, 'sine', 700, 180, 0.1, 0.3);
        this.notes(t + 0.07, 'triangle', [1318.5, 1760], 0.07, 0.16);
        break;
      case 'coin':
        this.notes(t, 'triangle', [1318.5, 1975.5], 0.07, 0.18);
        break;
      case 'buy':
        this.notes(t, 'triangle', [987.8, 1318.5, 1975.5], 0.05, 0.2);
        break;
      case 'level':
        this.notes(t, 'triangle', [523.3, 659.3, 784, 1046.5], 0.075, 0.22);
        break;
      case 'clear':
        this.notes(t, 'square', [784, 1046.5, 1318.5], 0.1, 0.1);
        this.tone(t + 0.3, 'triangle', 1568, 1568, 0.35, 0.18);
        break;
      case 'fail':
        this.notes(t, 'triangle', [392, 329.6, 261.6], 0.12, 0.2);
        break;
      case 'boss':
        this.tone(t, 'sawtooth', 70, 55, 0.7, 0.22);
        this.tone(t, 'square', 105, 82, 0.7, 0.08);
        this.noiseBurst(t, 0.5, 300, 0.2);
        break;
      case 'evolve':
        this.tone(t, 'sawtooth', 220, 880, 0.6, 0.12);
        this.notes(t + 0.35, 'triangle', [1046.5, 1318.5, 1568, 2093], 0.07, 0.18);
        break;
      case 'tap':
        this.tone(t, 'sine', 900, 600, 0.03, 0.12);
        break;
      case 'ally':
        this.tone(t, 'triangle', 1400, 700, 0.08, 0.1);
        break;
      case 'summon':
        this.tone(t, 'sine', 400, 1600, 0.45, 0.14);
        this.notes(t + 0.3, 'triangle', [1318.5, 1568], 0.06, 0.14);
        break;
      case 'legendary':
        this.notes(t, 'square', [784, 987.8, 1174.7, 1568], 0.09, 0.1);
        this.tone(t + 0.36, 'triangle', 2093, 2093, 0.5, 0.18);
        break;
    }
  }

  private open(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    // 백색 소음 0.5초 — 타격음 재료
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    void this.ctx.resume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.enabled && !this.suspended ? 0.55 : 0;
  }

  /** 한 음 — 주파수를 from → to 로 미끄러뜨리고 빠르게 사라진다 */
  private tone(t: number, type: OscillatorType, from: number, to: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private notes(t: number, type: OscillatorType, freqs: number[], step: number, vol: number): void {
    freqs.forEach((f, i) => this.tone(t + i * step, type, f, f, step * 1.8, vol));
  }

  private noiseBurst(t: number, dur: number, cutoff: number, vol: number): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = this.noise;
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
