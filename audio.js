"use strict";

// ── AUDIO ──────────────────────────────────────────────────────
const SFX = {
  _ctx: null, _bufs: {}, _loops: {}, _music: null,
  async load() {
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 44100 });
      const urls = {
        hit:     'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Hit.mp3',
        death:   'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Death.mp3',
        collide: 'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Collide.mp3',
        shuffle: 'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Shuffle.mp3',
        gun:        'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/GunSFX.mp3',
        ankleBreak: 'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/AnkleBreak.mp3',
        kick:       'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Kick.mp3',
        snoring:    'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Snoring.mp3',
        money:      'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Money.mp3',
        finale:     'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Finale.mp3',
        fakeDeath:  'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/FakeDeath.mp3',
        teleport:     'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Teleport.mp3',
        playerShoot:  'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/PlayerShoot.mp3',
        playerReload: 'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/PlayerReload.mp3',
        playerHeal:   'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/PlayerHeal.mp3',
      };
      await Promise.all(Object.entries(urls).map(async ([key, url]) => {
        const res = await fetch(url);
        const ab  = await res.arrayBuffer();
        this._bufs[key] = await this._ctx.decodeAudioData(ab);
      }));
    } catch(e) { console.warn('Audio failed to load:', e); }
  },
  async unlock() {
    if (!this._ctx) return;
    if (this._ctx.state === 'suspended') await this._ctx.resume();
    // Warm up the gain→destination path to eliminate first-sound latency
    const buf = this._ctx.createBuffer(1, 256, this._ctx.sampleRate);
    const src = this._ctx.createBufferSource();
    const gain = this._ctx.createGain();
    gain.gain.value = 0;
    src.buffer = buf;
    src.connect(gain); gain.connect(this._ctx.destination);
    src.start(this._ctx.currentTime);
  },
  play(key, volume = 1) {
    if (!this._ctx || !this._bufs[key]) return;
    const src = this._ctx.createBufferSource();
    const gain = this._ctx.createGain();
    src.buffer = this._bufs[key]; gain.gain.value = volume;
    src.connect(gain); gain.connect(this._ctx.destination); src.start();
  },
  // Toca com pitch aleatório (sem alterar velocidade perceptivelmente)
  // minSt/maxSt em semitons, ex: playPitched('hit', -2, 3, 1.0)
  playPitched(key, minSt = -4, maxSt = 4, volume = 1) {
    if (!this._ctx || !this._bufs[key]) return;
    const src = this._ctx.createBufferSource();
    const gain = this._ctx.createGain();
    src.buffer = this._bufs[key];
    gain.gain.value = volume;
    // detune em cents: interpola aleatório entre minSt e maxSt
    src.detune.value = (minSt + Math.random() * (maxSt - minSt)) * 100;
    src.connect(gain); gain.connect(this._ctx.destination);
    src.start(this._ctx.currentTime);
  },
  playFrom(key, offset = 0, volume = 1) {
    if (!this._ctx || !this._bufs[key]) return;
    const buf = this._bufs[key];
    const src = this._ctx.createBufferSource();
    const gain = this._ctx.createGain();
    src.buffer = buf; gain.gain.value = volume;
    src.connect(gain); gain.connect(this._ctx.destination);
    src.start(0, Math.min(offset, buf.duration));
  },
  playLoop(key, volume = 1) {
    if (!this._ctx || !this._bufs[key] || this._loops[key]) return;
    const gain = this._ctx.createGain();
    gain.gain.value = volume;
    gain.connect(this._ctx.destination);

    // Toca o buffer com variação aleatória a cada repetição
    const scheduleNext = () => {
      if (!this._loops[key]) return; // foi parado
      const buf = this._bufs[key];
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      // Varia playbackRate: pitch/velocidade aleatória entre 0.78 e 1.22
      src.playbackRate.value = 0.78 + Math.random() * 0.44;
      src.connect(gain);
      // Duração real levando em conta o rate
      const duration = buf.duration / src.playbackRate.value;
      src.start();
      this._loops[key].src = src;
      // Agenda o próximo ciclo
      this._loops[key].timeout = setTimeout(scheduleNext, duration * 1000 - 30);
    };

    this._loops[key] = { src: null, gain, timeout: null };
    scheduleNext();
  },
  stopLoop(key) {
    if (!this._loops[key]) return;
    clearTimeout(this._loops[key].timeout);
    try { this._loops[key].src && this._loops[key].src.stop(); } catch(e) {}
    this._loops[key] = null;
  },
  // ── MUSIC (BGM sem variação de pitch) ──────────────────────────
  playMusic(key, volume=1) {
    if (!this._ctx || !this._bufs[key]) return;
    if (this._music && this._music.key===key) return; // já tocando
    this.stopMusic();
    if (this._ctx.state==='suspended') this._ctx.resume();
    const gain=this._ctx.createGain();
    gain.gain.value=volume; gain.connect(this._ctx.destination);
    const src=this._ctx.createBufferSource();
    src.buffer=this._bufs[key]; src.loop=true;
    src.connect(gain); src.start();
    this._music={key,src,gain};
  },
  stopMusic() {
    if (!this._music) return;
    try { this._music.src.stop(); } catch(e) {}
    this._music=null;
  },
  // Guardrail: garante que a música continua tocando (retoma contexto suspenso, reinicia se parou)
  ensureMusic(key, volume=1) {
    if (this._ctx && this._ctx.state==='suspended') this._ctx.resume();
    if (!this._music || this._music.key!==key) { this.stopMusic(); this.playMusic(key, volume); }
  }
};
SFX.load();
window.addEventListener('touchstart', () => SFX.unlock(), { once: true, passive: true });
window.addEventListener('click',      () => SFX.unlock(), { once: true });

// ── CUSTOM SFX HELPER ──────────────────────────────────────────
function playSfxBuf(buf, volume=1, onended=null) {
  if (!SFX._ctx || !buf) return;
  const src = SFX._ctx.createBufferSource();
  const gain = SFX._ctx.createGain();
  src.buffer = buf; gain.gain.value = volume;
  src.connect(gain); gain.connect(SFX._ctx.destination);
  if (onended) src.onended = onended;
  src.start();
}
async function decodeAudioBase64(b64, ctx) {
  const bin = atob(b64.split(',')[1]||b64);
  const ab = new ArrayBuffer(bin.length);
  const view = new Uint8Array(ab);
  for (let i=0;i<bin.length;i++) view[i]=bin.charCodeAt(i);
  return ctx.decodeAudioData(ab);
}
