import { RarityId } from '../types/casino';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  setEnabled(value: boolean) {
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.06,
    delay = 0,
    endFreq?: number
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playTick(pitchBoost = 0) {
    this.playTone(460 + pitchBoost * 120, 0.032, 'triangle', 0.045, 0, 220);
  }

  playClick() {
    this.playTone(620, 0.045, 'sine', 0.035, 0, 480);
  }

  playCash() {
    this.playTone(587.33, 0.09, 'sine', 0.05, 0);
    this.playTone(880, 0.14, 'sine', 0.055, 0.06);
  }

  playOpenStart() {
    this.playTone(220, 0.14, 'triangle', 0.05, 0, 330);
    this.playTone(440, 0.16, 'sine', 0.04, 0.07, 520);
  }

  playReveal(rarity: RarityId) {
    switch (rarity) {
      case 'commune':
        this.playTone(392, 0.14, 'sine', 0.05, 0);
        this.playTone(493.88, 0.18, 'sine', 0.045, 0.07);
        break;
      case 'rare':
        this.playTone(440, 0.12, 'triangle', 0.055, 0);
        this.playTone(554.37, 0.14, 'triangle', 0.055, 0.07);
        this.playTone(659.25, 0.24, 'sine', 0.06, 0.14);
        break;
      case 'mythique':
        this.playTone(523.25, 0.14, 'triangle', 0.06, 0);
        this.playTone(659.25, 0.14, 'triangle', 0.06, 0.08);
        this.playTone(783.99, 0.16, 'sine', 0.065, 0.16);
        this.playTone(1046.5, 0.32, 'sine', 0.06, 0.24);
        break;
      case 'legendaire':
        this.playTone(587.33, 0.16, 'sawtooth', 0.035, 0);
        this.playTone(739.99, 0.18, 'triangle', 0.06, 0.08);
        this.playTone(880, 0.2, 'triangle', 0.065, 0.16);
        this.playTone(1174.66, 0.42, 'sine', 0.07, 0.24);
        break;
      case 'secret':
        this.playTone(440, 0.25, 'triangle', 0.06, 0);
        this.playTone(659.25, 0.25, 'triangle', 0.06, 0.08);
        this.playTone(880, 0.28, 'sine', 0.07, 0.16);
        this.playTone(1108.73, 0.32, 'sine', 0.07, 0.24);
        this.playTone(1318.51, 0.45, 'sine', 0.075, 0.32);
        this.playTone(1760, 0.65, 'sine', 0.065, 0.42);
        break;
    }
  }

  playFail() {
    this.playTone(300, 0.16, 'sawtooth', 0.035, 0, 180);
    this.playTone(210, 0.24, 'triangle', 0.04, 0.12, 130);
  }

  playGunshot(suppressed = false, sniper = false) {
    if (sniper) {
      this.playTone(170, 0.22, 'sawtooth', 0.085, 0, 38);
      this.playTone(620, 0.08, 'triangle', 0.05, 0, 95);
    } else if (suppressed) {
      this.playTone(290, 0.065, 'triangle', 0.045, 0, 110);
      this.playTone(760, 0.035, 'sine', 0.025, 0, 260);
    } else {
      this.playTone(220, 0.095, 'sawtooth', 0.06, 0, 58);
      this.playTone(520, 0.05, 'square', 0.03, 0, 130);
    }
  }

  playMeleeSlash(heavy = false, knifeType: 'karambit' | 'baionnette' | 'couteau' = 'couteau') {
    if (heavy) {
      const base = knifeType === 'karambit' ? 460 : knifeType === 'baionnette' ? 340 : 400;
      this.playTone(base, 0.14, 'triangle', 0.055, 0, 120);
      this.playTone(1350, 0.09, 'sine', 0.022, 0.03, 760);
    } else {
      const base = knifeType === 'karambit' ? 660 : knifeType === 'baionnette' ? 480 : 560;
      this.playTone(base, 0.085, 'sine', 0.042, 0, 185);
      this.playTone(1180, 0.045, 'triangle', 0.016, 0.01, 680);
    }
  }

  playKnifeDraw(knifeType: 'karambit' | 'baionnette' | 'couteau' = 'couteau') {
    if (knifeType === 'karambit') {
      this.playTone(980, 0.09, 'triangle', 0.025, 0.02, 1620);
      this.playTone(620, 0.045, 'sine', 0.03, 0.48, 420);
    } else if (knifeType === 'baionnette') {
      this.playTone(720, 0.11, 'triangle', 0.024, 0.02, 1120);
      this.playTone(380, 0.05, 'triangle', 0.038, 0.50, 220);
    } else {
      this.playTone(860, 0.09, 'triangle', 0.024, 0.02, 1340);
      this.playTone(540, 0.04, 'sine', 0.03, 0.42, 340);
    }
  }

  playReload() {
    this.playTone(420, 0.045, 'triangle', 0.04, 0, 520);
    this.playTone(680, 0.055, 'triangle', 0.045, 0.35, 860);
  }

  playMagOut(kind: string = 'ar15') {
    const pitch = kind === 'pistolet' ? 760 : kind === 'awp' ? 320 : 510;
    this.playTone(pitch, 0.038, 'triangle', 0.045, 0, pitch * 0.65);
    this.playTone(pitch * 0.48, 0.095, 'sine', 0.028, 0.025, pitch * 0.32);
  }

  playMagIn(kind: string = 'ar15') {
    const pitch = kind === 'pistolet' ? 680 : kind === 'awp' ? 280 : 420;
    this.playTone(pitch * 0.72, 0.045, 'triangle', 0.052, 0, pitch * 1.15);
    this.playTone(pitch * 1.45, 0.042, 'square', 0.022, 0.032, pitch * 1.75);
  }

  playBoltRack(kind: string = 'ar15') {
    if (kind === 'awp') {
      this.playTone(360, 0.055, 'triangle', 0.048, 0, 540);
      this.playTone(620, 0.06, 'sawtooth', 0.022, 0.08, 390);
    } else if (kind === 'pistolet' || kind === 'mac10') {
      this.playTone(880, 0.04, 'triangle', 0.042, 0, 1180);
      this.playTone(540, 0.035, 'square', 0.02, 0.045, 340);
    } else {
      this.playTone(580, 0.048, 'triangle', 0.048, 0, 920);
      this.playTone(1040, 0.042, 'sine', 0.026, 0.035, 720);
    }
  }

  playWeaponInspect(kind: string = 'ar15') {
    const base = kind === 'pistolet' ? 620 : kind === 'awp' ? 310 : 440;
    this.playTone(base, 0.08, 'sine', 0.018, 0.02, base * 1.25);
  }

  playHitmarker(headshot = false) {
    this.playTone(headshot ? 1480 : 960, 0.045, 'sine', 0.05, 0, headshot ? 1860 : 1120);
  }

  playZombieKill() {
    this.playTone(659.25, 0.075, 'sine', 0.055, 0);
    this.playTone(987.77, 0.12, 'sine', 0.06, 0.055);
  }
}

export const soundEngine = new SoundEngine();
