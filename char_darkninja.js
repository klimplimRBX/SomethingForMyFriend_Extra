"use strict";

// ── DARK NINJA ──────────────────────────────────────────────────
// Depende de: Character, Proj, DARKNINJA_IMGS, SHURIKEN_IMGS, ENGI_SLEDGE_RANGE,
//             AW, AH, SFX, imgOk, getWhite, clamp, lerp, rrect, canvas, DPR, cam

// ── CONSTANTS (da spec) ─────────────────────────────────────────
const DKN_HP                = 1500;
const DKN_SPREAD             = 0;      // mira com predição, sem spread aleatório

const DKN_SHURIKEN_DMG       = 50;
const DKN_SHURIKEN_BURST_N   = 3;
const DKN_SHURIKEN_SHOT_CD   = 0.7;
const DKN_SHURIKEN_RELOAD_CD = 1.5;
const DKN_FURY_PER_HIT       = 2;
const DKN_FURY_PER_MISS      = 3;
const DKN_SHURIKEN_NO_REPEAT = 2;

const DKN_KATANA_STAGES = [
  { dmg: 150, cd: 0.7   },
  { dmg: 125, cd: 0.6   },
  { dmg: 100,  cd: 0.4   },
  { dmg: 75,  cd: 0.2   },
  { dmg: 10,  cd: 0.125 },
];
const DKN_KATANA_RANGE       = ENGI_SLEDGE_RANGE + 15; // pendência: ajustar testando in-game

const DKN_FURY_MAX           = 10;
const DKN_ENRAGED_DUR        = 6.0;
const DKN_DASH_IMMUNE_DUR    = 2.0;
const DKN_ENRAGED_MOVE_SPD   = 100;

const DKN_START_POSE_DUR     = 2.0;
const DKN_TAKEOUT_POSE_DUR   = 0.5;
const DKN_THROW_POSE_DUR     = 0.5;
const DKN_WIN_KATANAPOSE_DUR = 1.0;

// ── ASSUNÇÕES (não estavam na spec — ajustar se precisar) ───────
const DKN_SHURIKEN_SPD       = 1300;   // velocidade do shuriken (aumentada de novo — ainda abaixo da bala do Engineer, 1500)
const DKN_DASH_IN_DUR        = 0.4;    // duração do dash de entrada
const DKN_DASH_OUT_DUR       = 0.4;    // duração do dash de saída (sem imunidade — ver pendência)
const DKN_DASH_OUT_DIST      = 220;    // quanto recua no dash de saída
const DKN_FURY_SHAKE_DUR     = 7.0;    // duração do screenshake ao encher fúria
const DKN_KATANA_SWING_DUR   = 0.14;   // duração visual do golpe (mesmo timing do swing do Engineer)
const DKN_SWING_ARC_SPAN     = 100 * Math.PI / 180;
const DKN_SWING_ARC_RADIUS   = 190;
const DKN_MOVE_PARTICLE_RATE = 0.06;
const DKN_MOVE_PARTICLE_LIFE = 0.35;
const DKN_FURYBAR_H          = 14;
const DKN_VISUAL_SCALE       = 1.4;    // personagem maior visualmente — NÃO mexe na hitbox (this.sz continua igual)
const DKN_KATANA_W_SIZE      = 56;     // altura de desenho da espada segurada

// ── PROJÉTIL DE SHURIKEN (trail preta, gira sozinho) ────────────
class ShurikenProj extends Proj {
  constructor(x, y, vx, vy, owner, img) {
    super(x, y, vx, vy, owner);
    this.dmg = DKN_SHURIKEN_DMG;
    this._projSz = 26; this._hitboxSz = 16;
    this._customImg = img;
    this._hit = false;
    this._rot = Math.random() * Math.PI * 2;
    this._spin = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 4);
  }
  update(dt) {
    super.update(dt);
    this._rot += this._spin * dt;
  }
  draw(c) {
    if (!this.alive) return;
    for (let i = 0; i < this.trail.length; i++) {
      const t = i / this.trail.length, sz = this._projSz * t * 0.6;
      c.save(); c.globalAlpha = t * 0.45; c.fillStyle = '#000';
      c.beginPath(); c.arc(this.trail[i].x, this.trail[i].y, sz / 2, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    const s = this._projSz;
    c.save();
    c.translate(this.x, this.y); c.rotate(this._rot);
    if (imgOk(this._customImg)) c.drawImage(this._customImg, -s / 2, -s / 2, s, s);
    else { c.fillStyle = '#222'; c.fillRect(-s / 2, -s / 2, s, s); }
    c.restore();
  }
}

// ── DARK NINJA CHARACTER ────────────────────────────────────────
class DarkNinjaCharacter extends Character {
  constructor(x, y, type) {
    super(x, y, type);
    this.hp = DKN_HP; this.maxHp = DKN_HP;
    this.fury = 0;

    this.state = 'idle_start';
    this._stateT = DKN_START_POSE_DUR;
    this._subState = null; this._subT = 0;

    this._burstCount = 0;
    this._burstDone = false;
    this._shurikenShotCD = 0;
    this._throwPoseT = 0;
    this._recentShurikenIdxs = [];
    this._pendingShurikens = [];

    this._immune = false; this._immuneT = 0; this._immuneLabel = null;

    this._enrageStageIdx = 0; this._katanaCD = 0; this._swingT = 0; this._enragedT = 0;
    this._aimAngle = 0;

    this._dashFrom = null; this._dashTo = null; this._dashT = 0;
    this._shakeT = 0;

    this._moveParticles = []; this._moveEmitT = 0;
    this._furyParticles = [];

    this._lastX = x; this._lastY = y;
    this._lastOther = null;
  }

  _shoot() { /* substituído inteiramente pela máquina de estados abaixo */ }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); this._tickImmuneLabel(dt); return; }
    this._lastOther = other;

    this.hitFlash   = Math.max(0, this.hitFlash - dt);
    this.slowTimer  = Math.max(0, this.slowTimer - dt);
    this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    this._collideCD = Math.max(0, this._collideCD - dt);
    this._immuneT   = Math.max(0, this._immuneT - dt);
    this._immune    = this._immuneT > 0;
    this._shakeT    = Math.max(0, this._shakeT - dt);
    this._swingT    = Math.max(0, this._swingT - dt); // decai sempre, não só durante o Enraged

    this._sweepPendingShurikens();
    this._updateMoveParticles(dt);
    this._updateFuryParticles(dt);

    if (other && !other.alive && this.state !== 'victory') this._startVictory();

    if (this.freezeTimer > 0) { this._tickLabel(dt); this._tickImmuneLabel(dt); return; }

    switch (this.state) {
      case 'idle_start':
        this._move(dt, other);
        this._stateT -= dt;
        if (this._stateT <= 0) { this.state = 'shuriken_cycle'; this._subState = 'takeout'; this._subT = DKN_TAKEOUT_POSE_DUR; }
        break;
      case 'shuriken_cycle':
        this._move(dt, other);
        this._updateShurikenCycle(dt, other, projs);
        break;
      case 'dash_in':
        this._updateDashIn(dt, other);
        break;
      case 'enraged':
        this._updateEnraged(dt, other);
        break;
      case 'dash_out':
        this._updateDashOut(dt, other);
        break;
      case 'victory':
        this._updateVictory(dt);
        break;
    }
    this._tickLabel(dt);
    this._tickImmuneLabel(dt);
  }

  // ── CICLO DE SHURIKEN ───────────────────────────────────────
  _updateShurikenCycle(dt, other, projs) {
    switch (this._subState) {
      case 'takeout':
        this._subT -= dt;
        if (this._subT <= 0) { this._subState = 'throw'; this._shurikenShotCD = 0; this._throwPoseT = 0; }
        break;
      case 'throw':
        this._shurikenShotCD -= dt;
        this._throwPoseT = Math.max(0, this._throwPoseT - dt);
        if (this._shurikenShotCD <= 0 && !this._burstDone && other && other.alive) {
          this._throwShuriken(other, projs);
          this._throwPoseT = DKN_THROW_POSE_DUR;
          this._burstCount++;
          if (this._burstCount >= DKN_SHURIKEN_BURST_N) {
            this._burstDone = true; // espera a pose do último arremesso terminar antes de recarregar
          } else {
            this._shurikenShotCD = DKN_SHURIKEN_SHOT_CD;
          }
        }
        if (this._burstDone && this._throwPoseT <= 0) {
          this._subState = 'wait_reload'; this._subT = DKN_SHURIKEN_RELOAD_CD;
          this._burstCount = 0; this._burstDone = false;
        }
        break;
      case 'wait_reload':
        this._subT -= dt;
        if (this._subT <= 0) { this._subState = 'takeout'; this._subT = DKN_TAKEOUT_POSE_DUR; }
        break;
    }
  }

  _throwShuriken(other, projs) {
    let idx;
    do { idx = Math.floor(Math.random() * SHURIKEN_IMGS.length); }
    while (this._recentShurikenIdxs.includes(idx) && this._recentShurikenIdxs.length < SHURIKEN_IMGS.length);
    this._recentShurikenIdxs.push(idx);
    if (this._recentShurikenIdxs.length > DKN_SHURIKEN_NO_REPEAT) this._recentShurikenIdxs.shift();

    // Mira com predição de posição do inimigo (sem spread — DKN_SPREAD=0)
    const dx = other.x - this.x, dy = other.y - this.y;
    const dist = Math.hypot(dx, dy);
    const t = clamp(dist / DKN_SHURIKEN_SPD, 0, 1.2);
    const aimX = other.x + (other.vx || 0) * (other.slowTimer > 0 ? 0.25 : 1) * t;
    const aimY = other.y + (other.vy || 0) * (other.slowTimer > 0 ? 0.25 : 1) * t;
    const a = Math.atan2(aimY - this.y, aimX - this.x);
    const p = new ShurikenProj(this.x, this.y, Math.cos(a) * DKN_SHURIKEN_SPD, Math.sin(a) * DKN_SHURIKEN_SPD, this, SHURIKEN_IMGS[idx]);
    projs.push(p);
    this._pendingShurikens.push(p);
  }

  // Hook genérico chamado por game.js quando um projétil DELE acerta (ver char_engineer.js)
  onProjHit(p, target) {
    if (p instanceof ShurikenProj && p.owner === this) {
      p._hit = true;
      this._addFury(DKN_FURY_PER_HIT, target);
    }
  }

  _sweepPendingShurikens() {
    for (let i = this._pendingShurikens.length - 1; i >= 0; i--) {
      const p = this._pendingShurikens[i];
      if (!p.alive) {
        if (!p._hit) this._addFury(DKN_FURY_PER_MISS, this._lastOther);
        this._pendingShurikens.splice(i, 1);
      }
    }
  }

  _addFury(n, other) {
    this.fury = Math.min(DKN_FURY_MAX, this.fury + n);
    if (this.fury >= DKN_FURY_MAX && this.state === 'shuriken_cycle' && other && other.alive) {
      this._triggerFuryBurst(other);
    }
  }

  _triggerFuryBurst(other) {
    this._spawnFuryParticles();
    this._shakeT = DKN_FURY_SHAKE_DUR;
    this._startDashIn(other);
  }

  // ── DASH IN → ENRAGED ────────────────────────────────────────
  _startDashIn(other) {
    this.state = 'dash_in';
    this._dashT = 0;
    this._dashFrom = { x: this.x, y: this.y };
    if (other) {
      const dx = this.x - other.x, dy = this.y - other.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      const contactDist = Math.max(4, (this.sz + other.sz) / 2 - 6);
      this._dashTo = {
        x: clamp(other.x + nx * contactDist, this.sz / 2, AW - this.sz / 2),
        y: clamp(other.y + ny * contactDist, this.sz / 2, AH - this.sz / 2),
      };
    } else {
      this._dashTo = { x: this.x, y: this.y };
    }
    this.fury = 0;
    this._immuneT = DKN_DASH_IMMUNE_DUR;
  }

  _updateDashIn(dt, other) {
    this._dashT += dt;
    const t = clamp(this._dashT / DKN_DASH_IN_DUR, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    this.x = lerp(this._dashFrom.x, this._dashTo.x, ease);
    this.y = lerp(this._dashFrom.y, this._dashTo.y, ease);
    if (t >= 1) {
      this.state = 'enraged';
      this._enragedT = DKN_ENRAGED_DUR;
      this._enrageStageIdx = 0; this._katanaCD = 0;
      if (other) this._aimAngle = Math.atan2(other.y - this.y, other.x - this.x);
    }
  }

  _updateEnraged(dt, other) {
    this._enragedT -= dt;
    this._katanaCD = Math.max(0, this._katanaCD - dt);

    if (other && other.alive) {
      const dx = other.x - this.x, dy = other.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const nx = dx / d, ny = dy / d;
        this.x = clamp(this.x + nx * DKN_ENRAGED_MOVE_SPD * dt, this.sz / 2, AW - this.sz / 2);
        this.y = clamp(this.y + ny * DKN_ENRAGED_MOVE_SPD * dt, this.sz / 2, AH - this.sz / 2);
      }
      this._aimAngle = Math.atan2(dy, dx);
      const otherSz = other.sz !== undefined ? other.sz : this.sz;
      const edgeDist = Math.max(0, d - (this.sz / 2 + otherSz / 2));
      if (this._katanaCD <= 0 && edgeDist <= DKN_KATANA_RANGE) {
        const stage = DKN_KATANA_STAGES[Math.min(this._enrageStageIdx, DKN_KATANA_STAGES.length - 1)];
        this._katanaCD = stage.cd;
        this._swingT = DKN_KATANA_SWING_DUR;
        other.takeDamage(stage.dmg);
        SFX.playPitched('darkNinjaStab', -1.5, 1.5, 1.0);
        this.fury = Math.min(DKN_FURY_MAX, this.fury + 0.25);
        if (this._enrageStageIdx < DKN_KATANA_STAGES.length - 1) this._enrageStageIdx++;
      }
    }

    if (this._enragedT <= 0) this._startDashOut(other);
  }

  // ── DASH OUT → CICLO DE SHURIKEN ────────────────────────────
  _startDashOut(other) {
    this.state = 'dash_out';
    this._dashT = 0;
    this._dashFrom = { x: this.x, y: this.y };
    if (other) {
      const dx = this.x - other.x, dy = this.y - other.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      this._dashTo = {
        x: clamp(this.x + nx * DKN_DASH_OUT_DIST, this.sz / 2, AW - this.sz / 2),
        y: clamp(this.y + ny * DKN_DASH_OUT_DIST, this.sz / 2, AH - this.sz / 2),
      };
    } else {
      this._dashTo = { x: this.x, y: this.y };
    }
  }

  _updateDashOut(dt, other) {
    this._dashT += dt;
    const t = clamp(this._dashT / DKN_DASH_OUT_DUR, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    this.x = lerp(this._dashFrom.x, this._dashTo.x, ease);
    this.y = lerp(this._dashFrom.y, this._dashTo.y, ease);
    if (t >= 1) {
      this.state = 'shuriken_cycle';
      this._subState = 'takeout'; this._subT = DKN_TAKEOUT_POSE_DUR;
      this._burstCount = 0; this._burstDone = false; this._shurikenShotCD = 0; this._throwPoseT = 0;
    }
  }

  // ── VITÓRIA ──────────────────────────────────────────────────
  _startVictory() {
    this.state = 'victory';
    this._subState = 'pose'; this._subT = DKN_WIN_KATANAPOSE_DUR;
  }
  _updateVictory(dt) {
    this._move(dt, null);
    if (this._subState === 'pose') {
      this._subT -= dt;
      if (this._subT <= 0) this._subState = 'idle';
    }
  }

  // ── IMUNIDADE (dash de entrada) ──────────────────────────────
  takeDamage(v, noSlow) {
    if (!this.alive) return;
    if (this._immune) {
      this._immuneLabel = { x: this.x, y: this.y - this.sz / 2 - 22, fade: 0.9 };
      return;
    }
    super.takeDamage(v, noSlow);
  }
  _tickImmuneLabel(dt) {
    if (this._immuneLabel) {
      this._immuneLabel.fade -= dt;
      if (this._immuneLabel.fade <= 0) this._immuneLabel = null;
    }
  }

  // ── PARTÍCULAS DE FÚRIA (barra cheia) ────────────────────────
  _spawnFuryParticles() {
    const palette = ['#111111', '#555555', '#B22222'];
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const spd = 80 + Math.random() * 140;
      this._furyParticles.push({
        x: this.x, y: this.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        sz: 4 + Math.random() * 5, life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
        color: palette[i % palette.length],
      });
    }
  }
  _updateFuryParticles(dt) {
    for (let i = this._furyParticles.length - 1; i >= 0; i--) {
      const p = this._furyParticles[i];
      p.life -= dt;
      if (p.life <= 0) { this._furyParticles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 40 * dt;
    }
  }
  _drawFuryParticles(c) {
    for (const p of this._furyParticles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      c.save(); c.globalAlpha = a; c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.sz / 2, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  // ── PARTÍCULAS DE MOVIMENTO (trilha preta, fora do Enraged) ──
  _updateMoveParticles(dt) {
    const dx = this.x - this._lastX, dy = this.y - this._lastY;
    const speed = Math.hypot(dx, dy) / Math.max(dt, 1e-4);
    this._lastX = this.x; this._lastY = this.y;
    if (this.state !== 'enraged' && this.alive) {
      this._moveEmitT -= dt;
      if (this._moveEmitT <= 0 && speed > 5) {
        this._moveEmitT = DKN_MOVE_PARTICLE_RATE;
        this._moveParticles.push({ x: this.x, y: this.y, life: DKN_MOVE_PARTICLE_LIFE, maxLife: DKN_MOVE_PARTICLE_LIFE, sz: 10 + Math.random() * 6 });
      }
    }
    for (let i = this._moveParticles.length - 1; i >= 0; i--) {
      const p = this._moveParticles[i];
      p.life -= dt;
      if (p.life <= 0) this._moveParticles.splice(i, 1);
    }
  }
  _drawMoveParticles(c) {
    for (const p of this._moveParticles) {
      const a = clamp(p.life / p.maxLife, 0, 1) * 0.35;
      c.save(); c.globalAlpha = a; c.fillStyle = '#000';
      c.beginPath(); c.arc(p.x, p.y, p.sz / 2, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  // ── SPRITE ATUAL ─────────────────────────────────────────────
  _currentImgKey() {
    switch (this.state) {
      case 'idle_start': return 'WinStartPose';
      case 'shuriken_cycle':
        if (this._subState === 'takeout') return 'TakeOutShuriken';
        if (this._subState === 'throw') return this._throwPoseT > 0 ? 'ThrowShuriken' : 'WinStartPose';
        return 'WinStartPose';
      case 'dash_in': case 'dash_out': return 'Dash';
      case 'enraged': return 'KatanaOut';
      case 'victory': return this._subState === 'pose' ? 'KatanaPose' : 'WinStartPose';
    }
    return 'WinStartPose';
  }

  draw(c) {
    if (!this.alive) { this._drawLabels(c); return; }
    this._drawMoveParticles(c);

    const sz = this.sz * DKN_VISUAL_SCALE; // só visual — hitbox (this.sz) não muda
    const facingLeft = this._lastOther && this._lastOther.alive && this._lastOther.x < this.x;

    // Espada física: aparece durante o Enraged, seguindo o mesmo braço/ângulo
    // do corte (igual o Engineer segura e balança a sledge em char_engineer.js)
    if (this.state === 'enraged') {
      const half = DKN_SWING_ARC_SPAN / 2;
      const swingProg = this._swingT > 0 ? clamp(1 - (this._swingT / DKN_KATANA_SWING_DUR), 0, 1) : 0;
      const swingOffset = this._swingT > 0 ? lerp(-half, half, swingProg) : 0;
      const gH = DKN_KATANA_W_SIZE;
      const katanaImg = DARKNINJA_IMGS.Katana;
      const gW = imgOk(katanaImg) ? gH * (katanaImg.naturalWidth / katanaImg.naturalHeight) : gH;
      const edgeDist = sz / 2 + 4;
      const gx = this.x + Math.cos(this._aimAngle) * edgeDist;
      const gy = this.y + Math.sin(this._aimAngle) * edgeDist;
      c.save();
      c.translate(gx, gy);
      c.rotate(this._aimAngle + swingOffset);
      if (imgOk(katanaImg)) {
        c.drawImage(katanaImg, 0, -gH / 2, gW, gH);
      } else {
        c.fillStyle = '#ccc'; c.fillRect(0, -4, gW || 40, 8);
      }
      c.restore();
    }

    const img = DARKNINJA_IMGS[this._currentImgKey()];
    c.save();
    c.translate(this.x, this.y);
    c.scale(facingLeft ? -1 : 1, 1);
    if (imgOk(img)) {
      c.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      if (this.hitFlash > 0) { const wt = getWhite(img); if (wt) c.drawImage(wt, -sz / 2, -sz / 2, sz, sz); }
    } else {
      c.fillStyle = this.hitFlash > 0 ? 'white' : this.color;
      c.fillRect(-sz / 2, -sz / 2, sz, sz);
      c.strokeStyle = 'white'; c.lineWidth = 3; c.strokeRect(-sz / 2, -sz / 2, sz, sz);
    }
    c.restore();

    if (this.freezeTimer > 0) {
      c.save(); c.globalAlpha = 0.45; c.fillStyle = '#A0DFFF';
      c.fillRect(this.x - sz / 2, this.y - sz / 2, sz, sz); c.restore();
    }
    if (this._swingT > 0) this._drawKatanaSwing(c);
    this._drawFuryParticles(c);
    if (this._immuneLabel) this._drawImmuneLabel(c);
    this._drawLabels(c);
  }

  _drawKatanaSwing(c) {
    const half = DKN_SWING_ARC_SPAN / 2;
    const swingProg = clamp(1 - (this._swingT / DKN_KATANA_SWING_DUR), 0, 1);
    const startA = this._aimAngle - half, endA = this._aimAngle + half;
    const curA = lerp(startA, endA, swingProg);
    const fade = clamp(1 - swingProg * 0.55, 0, 1);
    const outerR = DKN_SWING_ARC_RADIUS, innerR = outerR * 0.2;
    c.save();
    c.globalAlpha = 0.85 * fade;
    c.beginPath();
    c.arc(this.x, this.y, outerR, startA, curA);
    c.arc(this.x, this.y, innerR, curA, startA, true);
    c.closePath();
    const grad = c.createRadialGradient(this.x, this.y, innerR * 0.4, this.x, this.y, outerR);
    grad.addColorStop(0,    'rgba(0,0,0,0)');
    grad.addColorStop(0.55, 'rgba(20,20,20,0.35)');
    grad.addColorStop(0.9,  'rgba(0,0,0,0.9)');
    grad.addColorStop(1,    'rgba(0,0,0,0)');
    c.fillStyle = grad; c.fill();
    c.lineWidth = 3; c.strokeStyle = `rgba(0,0,0,${0.9 * fade})`;
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 10;
    c.beginPath(); c.arc(this.x, this.y, outerR, startA, curA); c.stroke();
    c.restore();
  }

  _drawImmuneLabel(c) {
    const { x, y, fade } = this._immuneLabel;
    c.save(); c.globalAlpha = clamp(fade, 0, 1); c.textAlign = 'center';
    c.font = 'bold 16px Arial Black,sans-serif'; c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.strokeText('IMMUNE', x, y);
    c.fillStyle = '#00BFFF'; c.fillText('IMMUNE', x, y);
    c.restore();
  }

  drawHUD(c, camRef) {
    if (!this.alive) return;
    const cw = canvas.width / DPR, ch = canvas.height / DPR;
    const sx = cw / 2 + (this.x - camRef.x) * camRef.zoom;
    const sy = ch / 2 + (this.y - camRef.y) * camRef.zoom;
    const half = (this.sz * DKN_VISUAL_SCALE / 2) * camRef.zoom;
    this._drawHPScreen(c, sx, sy - half);
    this._drawFuryBar(c, sx, sy - half);
  }

  _drawFuryBar(c, cx, topY) {
    const barW = 90, barH = 16;
    const hpBy = topY - barH - 6;
    const fh = DKN_FURYBAR_H;
    const fy = hpBy - fh - 3;
    const bx = cx - barW / 2;
    const ratio = clamp(this.fury / DKN_FURY_MAX, 0, 1);
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.55)'; rrect(c, bx, fy, barW, fh, fh / 2); c.fill();
    if (ratio > 0) {
      c.save(); rrect(c, bx, fy, barW, fh, fh / 2); c.clip();
      c.fillStyle = '#8B0000'; c.fillRect(bx, fy, barW * ratio, fh);
      c.restore();
    }
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 1; rrect(c, bx, fy, barW, fh, fh / 2); c.stroke();
    c.font = `bold ${fh - 2}px Arial Black,sans-serif`; c.textAlign = 'center';
    c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.9)';
    const label = 'Fury: ' + Math.floor(this.fury);
    c.strokeText(label, cx, fy + fh - 2);
    c.fillStyle = 'white'; c.fillText(label, cx, fy + fh - 2);
    c.restore();
  }
}
