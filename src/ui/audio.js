// src/ui/audio.js — synthesized SFX via WebAudio. No asset files, no network.
// Respects a master mute and a gentle volume. Never startling.

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.vol = 0.6;
    this._foundationStreak = 0;
  }
  _ensure() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.vol;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* no audio available */ }
  }
  resume() { this._ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; }

  _noise(dur) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  _tone(freq, dur, type = 'sine', gain = 0.3, attack = 0.005, release = 0.08) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + release + 0.02);
  }

  place() {
    this._ensure(); if (!this.ctx) return;
    const ctx = this.ctx;
    const n = this._noise(0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0.5;
    n.connect(f).connect(g).connect(this.master);
    n.start();
  }
  draw() {
    this._ensure(); if (!this.ctx) return;
    const n = this._noise(0.09);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1200;
    const g = this.ctx.createGain(); g.gain.value = 0.18;
    n.connect(f).connect(g).connect(this.master);
    n.start();
  }
  flip() {
    this._ensure(); if (!this.ctx) return;
    const n = this._noise(0.06);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.7;
    const g = this.ctx.createGain(); g.gain.value = 0.16;
    n.connect(f).connect(g).connect(this.master);
    n.start();
  }
  foundation() {
    this._ensure(); if (!this.ctx) return;
    // bell ping, rising a semitone per consecutive foundation card
    const base = 523.25; // C5
    const semis = Math.min(this._foundationStreak, 12);
    const freq = base * Math.pow(2, semis / 12);
    this._tone(freq, 0.18, 'sine', 0.22);
    this._tone(freq * 2, 0.14, 'sine', 0.08);
    this._foundationStreak++;
  }
  resetFoundationStreak() { this._foundationStreak = 0; }
  invalid() {
    this._ensure(); if (!this.ctx) return;
    this._tone(120, 0.12, 'sine', 0.18, 0.002, 0.04);
  }
  victory() {
    this._ensure(); if (!this.ctx) return;
    // slow major arpeggio C E G C
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      setTimeout(() => {
        this._tone(f, 0.5, 'triangle', 0.18);
        this._tone(f * 2, 0.4, 'sine', 0.06);
      }, i * 160);
    });
    // shimmer tail
    setTimeout(() => this._tone(1568, 0.8, 'sine', 0.07), 700);
  }
  unlock() {
    this._ensure(); if (!this.ctx) return;
    this._tone(659.25, 0.2, 'sine', 0.16);
    setTimeout(() => this._tone(987.77, 0.35, 'sine', 0.16), 120);
  }
}

export const audio = new AudioEngine();