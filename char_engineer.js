"use strict";

// ── ENGINEER ────────────────────────────────────────────────────
// Depende de: Character, Proj, ENGI_IMG, ENGI_BULLET_IMG, ENGI_SLEDGE_IMG, SENTRY_IMG,
//             AW, AH, SFX, imgOk, getWhite, clamp, lerp, rrect, canvas, DPR

// ── CONSTANTS ───────────────────────────────────────────────────
const ENGI_HP           = 800;
const ENGI_RANGE_THRESH = 70;     // acima disso = Ranged, abaixo = Sledge
const ENGI_BULLET_DMG   = 30;
const ENGI_BULLET_SPD   = 1250;
const ENGI_BULLET_CD    = 2.2;
const ENGI_SLEDGE_DMG   = 150;
const ENGI_SLEDGE_CD    = 3.0;
const ENGI_SLEDGE_RANGE = 100;    // alcance real do swing (um pouco além do gatilho de 70px)
const ENGI_SWING_DUR    = 0.28;
const ENGI_KNOCKBACK    = 110;
const ENGI_STUN_DUR     = 1.0;
const ENGI_CONFUSE_DUR  = 5.0;
const ENGI_CONFUSE_FALLBACK_DEG = 7.5;
const ENGI_SCRAP_NEEDED = 5;
const ENGI_XP_REQ = { 1:100, 2:200, 3:400, 4:600 };

// ── SENTRY TIERS ────────────────────────────────────────────────
const SENTRY_TIERS = [
  /* 0 - Sentry           */ { name:'Sentry',           hp:100, dmg:10, cd:1.0, projSpd:800,  predictive:false },
  /* 1 - Upgraded Sentry  */ { name:'Upgraded Sentry',  hp:120, dmg:15, cd:0.9, projSpd:850,  predictive:false },
  /* 2 - Rifle Sentry     */ { name:'Rifle Sentry',     hp:150, dmg:25, cd:1.5, projSpd:1200, predictive:true  },
  /* 3 - Minigun Sentry   */ { name:'Minigun Sentry',   hp:175, dmg:3,  cd:0.1, projSpd:1200, predictive:true  },
  /* 4 - War Machine      */ { name:'War Machine Sentry',hp:200, dmg:5, cd:0.1, projSpd:1200, predictive:true  },
];
const SENTRY_SZ = 40;

// ── CONFUSÃO (efeito genérico, aplicável a qualquer Character) ──
// "Confused" dobra o spread do alvo (ou usa 7.5° se ele não tiver spread definido).
// A leitura do spread e o jitter em si são aplicados de fora (game.js), sobre
// os projéteis recém-criados de um dono confuso — assim funciona pra qualquer
// tipo de inimigo sem precisar mexer em cada char_*.js.
function applyConfusion(target, seconds) {
  if (!target) return;
  target.confusedTimer = Math.max(target.confusedTimer || 0, seconds);
}
function _confusedSpreadDeg(owner) {
  const cfgSpread = (owner._pcfg && owner._pcfg.spread) || owner.spread || 0;
  return cfgSpread > 0 ? cfgSpread * 2 : ENGI_CONFUSE_FALLBACK_DEG;
}
function knockbackChar(from, target, dist) {
  if (!target) return;
  const dx = target.x - from.x, dy = target.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;
  const h = target.sz / 2;
  target.x = clamp(target.x + nx * dist, h, AW - h);
  target.y = clamp(target.y + ny * dist, h, AH - h);
}

// ── PARTÍCULAS DE EXPLOSÃO (sentry destruída) ──────────────────
const _sentryParticles = [];
function spawnSentryExplosion(x, y) {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 90 + Math.random() * 160;
    _sentryParticles.push({
      x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      sz: 4 + Math.random() * 5, life: 0.5 + Math.random() * 0.35,
      maxLife: 0.85, rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 10,
    });
  }
  SFX.play('death', 0.6);
}
function updateSentryParticles(dt) {
  for (let i = _sentryParticles.length - 1; i >= 0; i--) {
    const p = _sentryParticles[i];
    p.life -= dt;
    if (p.life <= 0) { _sentryParticles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= (1 - Math.min(1, dt * 2.2));
    p.vy *= (1 - Math.min(1, dt * 2.2));
    p.rot += p.vrot * dt;
  }
}
function drawSentryParticles(c) {
  for (const p of _sentryParticles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    c.save();
    c.globalAlpha = a;
    c.translate(p.x, p.y); c.rotate(p.rot);
    c.fillStyle = '#9a9a9a';
    c.fillRect(-p.sz/2, -p.sz/2, p.sz, p.sz);
    c.restore();
  }
}
function resetSentryEffects() { _sentryParticles.length = 0; }

// ── PROJÉTIL DE SENTRY (10x10px, engibullet.png) ───────────────
class SentryProj extends Proj {
  constructor(x, y, vx, vy, owner) {
    super(x, y, vx, vy, owner);
    this.dmg = owner.dmg;
    this._projSz = 10; this._hitboxSz = 10;
    this._customImg = ENGI_BULLET_IMG;
  }
}

// ── SENTRY (torreta) ────────────────────────────────────────────
class Sentry {
  constructor(x, y, tier, master) {
    const t = SENTRY_TIERS[clamp(tier, 0, SENTRY_TIERS.length - 1)];
    this.x = x; this.y = y; this.sz = SENTRY_SZ;
    this.tier = tier; this.master = master;
    this.hp = t.hp; this.maxHp = t.hp; this.dmg = t.dmg;
    this.cooldown = t.cd; this.projSpd = t.projSpd; this.predictive = t.predictive;
    this.alive = true; this.hitFlash = 0;
    this._cd = this.cooldown * 0.4; // pequeno delay antes do 1º tiro
    // Campos exigidos pra interoperar com a colisão física genérica de Character._move()
    this.vx = 0; this.vy = 0; this.slowTimer = 0; this._collideCD = 0; this.noCollide = false;
  }

  update(dt, other, projs) {
    if (!this.alive) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this._collideCD = Math.max(0, this._collideCD - dt);
    this._cd = Math.max(0, this._cd - dt);
    if (this._cd <= 0 && other && other.alive) {
      this._cd = this.cooldown;
      let aimX = other.x, aimY = other.y;
      if (this.predictive) {
        const dx = other.x - this.x, dy = other.y - this.y;
        const dist = Math.hypot(dx, dy);
        const t = clamp(dist / this.projSpd, 0, 2);
        aimX = other.x + (other.vx || 0) * (other.slowTimer > 0 ? 0.25 : 1) * t;
        aimY = other.y + (other.vy || 0) * (other.slowTimer > 0 ? 0.25 : 1) * t;
      }
      const a = Math.atan2(aimY - this.y, aimX - this.x);
      projs.push(new SentryProj(this.x, this.y, Math.cos(a) * this.projSpd, Math.sin(a) * this.projSpd, this));
    }
  }

  takeDamage(v) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - v);
    this.hitFlash = 0.15;
    if (this.hp <= 0) {
      this.alive = false;
      spawnSentryExplosion(this.x, this.y);
      if (this.master && this.master.sentry === this) this.master.sentry = null;
    }
  }

  // Usada quando uma sentry nova substitui uma existente — some sem explodir.
  dismiss() {
    this.alive = false;
    if (this.master && this.master.sentry === this) this.master.sentry = null;
  }

  draw(c) {
    if (!this.alive) return;
    const sz = this.sz;
    if (imgOk(SENTRY_IMG)) {
      c.drawImage(SENTRY_IMG, this.x - sz/2, this.y - sz/2, sz, sz);
      if (this.hitFlash > 0) {
        const wt = getWhite(SENTRY_IMG);
        if (wt) c.drawImage(wt, this.x - sz/2, this.y - sz/2, sz, sz);
      }
    } else {
      c.fillStyle = this.hitFlash > 0 ? '#fff' : '#7f8c8d';
      c.fillRect(this.x - sz/2, this.y - sz/2, sz, sz);
      c.strokeStyle = 'white'; c.lineWidth = 2;
      c.strokeRect(this.x - sz/2, this.y - sz/2, sz, sz);
    }
    // Nível acima da cabeça — só a partir do tier 1 (vida e nome ficam escondidos)
    if (this.tier >= 1) {
      c.save(); c.textAlign = 'center'; c.font = 'bold 12px Arial Black,sans-serif';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.9)';
      c.strokeText('Lv.' + this.tier, this.x, this.y - sz/2 - 6);
      c.fillStyle = '#FFD700';
      c.fillText('Lv.' + this.tier, this.x, this.y - sz/2 - 6);
      c.restore();
    }
  }
}

// ── ENGINEER CHARACTER ─────────────────────────────────────────
class EngineerCharacter extends Character {
  constructor(x, y, type) {
    super(x, y, type);
    this.hp = ENGI_HP; this.maxHp = ENGI_HP;

    this.level = 0;
    this.xp = 0;
    this.scrap = 0;
    this.sentry = null;
    this.sentryTier = 0;
    this._immuneToDebuffs = false;

    this.bulletDmg      = ENGI_BULLET_DMG;
    this.sledgeDmg       = ENGI_SLEDGE_DMG;
    this.bulletCooldown = ENGI_BULLET_CD;
    this.sledgeCooldown  = ENGI_SLEDGE_CD;

    this._mode      = 'ranged';
    this._bulletCD  = 0;
    this._sledgeCD  = 0;
    this._swingT    = 0;
    this._aimAngle  = 0;

    // ── Nível 4: imunidade a stun/slow/confusão ──
    // Interceptamos via getters/setters — qualquer código externo (Baiano Z,
    // o próprio sledge de outro Engineer, etc.) que tentar aplicar essas
    // timers é silenciosamente ignorado enquanto _immuneToDebuffs=true.
    let _freeze = 0, _slow = 0, _confused = 0;
    Object.defineProperty(this, 'freezeTimer', {
      get: () => _freeze,
      set: (v) => { _freeze = this._immuneToDebuffs ? 0 : v; },
    });
    Object.defineProperty(this, 'slowTimer', {
      get: () => _slow,
      set: (v) => { _slow = this._immuneToDebuffs ? 0 : v; },
    });
    Object.defineProperty(this, 'confusedTimer', {
      get: () => _confused,
      set: (v) => { _confused = this._immuneToDebuffs ? 0 : v; },
    });
  }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); return; }
    this.hitFlash  = Math.max(0, this.hitFlash - dt);
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    this.confusedTimer = Math.max(0, this.confusedTimer - dt);
    this._collideCD = Math.max(0, this._collideCD - dt);
    this._swingT = Math.max(0, this._swingT - dt);
    if (this.freezeTimer > 0) { this._tickLabel(dt); return; }
    this._move(dt, other);
    this._shoot(dt, other, projs);
    this._tickLabel(dt);
  }

  _shoot(dt, other, projs) {
    this._bulletCD = Math.max(0, this._bulletCD - dt);
    this._sledgeCD = Math.max(0, this._sledgeCD - dt);
    if (!other || !other.alive) return;

    const dx = other.x - this.x, dy = other.y - this.y;
    const centerDist = Math.hypot(dx, dy);
    // Distância de borda a borda: colisão física nunca deixa os centros
    // ficarem a menos de (sz1+sz2)/2 um do outro (~72px por padrão), então
    // medir "70px" a partir do centro nunca disparava o Sledge. Usamos a
    // distância entre as bordas dos dois personagens, que é o que a pessoa
    // realmente percebe como "perto".
    const otherSz = (other.sz !== undefined) ? other.sz : this.sz;
    const dist = Math.max(0, centerDist - (this.sz/2 + otherSz/2));
    this._aimAngle = Math.atan2(dy, dx);
    this._mode = dist > ENGI_RANGE_THRESH ? 'ranged' : 'sledge';

    if (this._mode === 'ranged') {
      if (this._bulletCD <= 0) {
        this._bulletCD = this.bulletCooldown;
        const p = new Proj(this.x, this.y, Math.cos(this._aimAngle) * ENGI_BULLET_SPD, Math.sin(this._aimAngle) * ENGI_BULLET_SPD, this);
        p.dmg = this.bulletDmg; p._customImg = ENGI_BULLET_IMG; p._projSz = 16; p._hitboxSz = 14;
        projs.push(p);
      }
    } else {
      if (this._sledgeCD <= 0 && dist <= ENGI_SLEDGE_RANGE) {
        this._sledgeCD = this.sledgeCooldown;
        this._swingT = ENGI_SWING_DUR;
        other.takeDamage(this.sledgeDmg);
        knockbackChar(this, other, ENGI_KNOCKBACK);
        other.freezeTimer = Math.max(other.freezeTimer || 0, ENGI_STUN_DUR);
        applyConfusion(other, ENGI_CONFUSE_DUR);
        this._grantRewards(2, 40);
        SFX.playPitched('kick', -2, 2, 1.0);
      }
    }
  }

  // Chamado quando um projétil DELE conecta (hook genérico usado pelo loop principal em game.js)
  onProjHit(p, target) {
    this._grantRewards(1, 20);
  }

  _grantRewards(scrapAmt, xpAmt) {
    this.scrap += scrapAmt;
    this.xp += xpAmt;
    if (this.scrap >= ENGI_SCRAP_NEEDED) {
      this.scrap = 0;
      this._spawnSentry();
    }
    this._checkLevelUp();
  }

  _checkLevelUp() {
    while (this.level < 4) {
      const req = ENGI_XP_REQ[this.level + 1];
      if (this.xp < req) break;
      this.level++;
      this.xp = 0;
      this._applyLevelBonus(this.level);
      SFX.play('money', 0.9);
    }
  }

  _applyLevelBonus(lvl) {
    if (lvl === 1) {
      this.maxHp += 100; this.hp = Math.min(this.maxHp, this.hp + 100);
      this.bulletDmg += 10;
      this.sentryTier = 1;
    } else if (lvl === 2) {
      this.maxHp += 100; this.hp = Math.min(this.maxHp, this.hp + 100);
      this.bulletDmg += 10;
      this.sentryTier = 2;
    } else if (lvl === 3) {
      this.sentryTier = 3;
    } else if (lvl === 4) {
      this.maxHp += 200; this.hp = Math.min(this.maxHp, this.hp + 200);
      this.bulletDmg += 20;
      this.sledgeDmg += 50;
      this.bulletCooldown = Math.max(0.1, this.bulletCooldown - 0.7);
      this.sledgeCooldown = Math.max(0.1, this.sledgeCooldown - 0.5);
      this.sentryTier = 4;
      this._immuneToDebuffs = true;
      this.freezeTimer = 0; this.slowTimer = 0; this.confusedTimer = 0;
    }
  }

  _spawnSentry() {
    if (this.sentry && this.sentry.alive) this.sentry.dismiss();
    const a = Math.random() * Math.PI * 2;
    const d = 70 + Math.random() * 40;
    const h = SENTRY_SZ / 2;
    const sx = clamp(this.x + Math.cos(a) * d, h, AW - h);
    const sy = clamp(this.y + Math.sin(a) * d, h, AH - h);
    this.sentry = new Sentry(sx, sy, this.sentryTier, this);
    SFX.play('teleport', 0.7);
  }

  takeDamage(v) {
    super.takeDamage(v);
    if (!this.alive && this.sentry && this.sentry.alive) {
      spawnSentryExplosion(this.sentry.x, this.sentry.y);
      this.sentry.alive = false;
      this.sentry = null;
    }
  }

  draw(c) {
    if (this.alive) {
      const sz = this.sz;
      // Marreta: só aparece perto do alvo (modo Sledge), com swing na frente do personagem
      if (this._mode === 'sledge') {
        const gH = 46;
        const gW = imgOk(ENGI_SLEDGE_IMG) ? gH * (ENGI_SLEDGE_IMG.naturalWidth / ENGI_SLEDGE_IMG.naturalHeight) : gH;
        const swingProg = this._swingT > 0 ? 1 - (this._swingT / ENGI_SWING_DUR) : 0;
        const swingOffset = this._swingT > 0 ? lerp(-0.85, 0.85, swingProg) : 0;
        const edgeDist = sz/2 + 4;
        const gx = this.x + Math.cos(this._aimAngle) * edgeDist;
        const gy = this.y + Math.sin(this._aimAngle) * edgeDist;
        c.save();
        c.translate(gx, gy);
        c.rotate(this._aimAngle + swingOffset - Math.PI/4); // -45° compensa a diagonal da arte original
        if (imgOk(ENGI_SLEDGE_IMG)) {
          c.drawImage(ENGI_SLEDGE_IMG, 0, -gH/2, gW, gH);
        } else {
          c.fillStyle = '#8a6d3b'; c.fillRect(0, -6, gW || 40, 12);
        }
        c.restore();
      }
      // Corpo
      if (imgOk(ENGI_IMG)) {
        c.drawImage(ENGI_IMG, this.x - sz/2, this.y - sz/2, sz, sz);
        if (this.hitFlash > 0) {
          const wt = getWhite(ENGI_IMG);
          if (wt) c.drawImage(wt, this.x - sz/2, this.y - sz/2, sz, sz);
        }
      } else {
        c.fillStyle = this.hitFlash > 0 ? 'white' : this.color;
        c.fillRect(this.x - sz/2, this.y - sz/2, sz, sz);
        c.strokeStyle = 'white'; c.lineWidth = 3;
        c.strokeRect(this.x - sz/2, this.y - sz/2, sz, sz);
      }
      if (this.freezeTimer > 0) {
        c.save(); c.globalAlpha = 0.45; c.fillStyle = '#A0DFFF';
        c.fillRect(this.x - sz/2, this.y - sz/2, sz, sz);
        c.restore();
      }
    }
    this._drawLabels(c);
  }

  drawHUD(c, camRef) {
    if (!this.alive) return;
    const cw = canvas.width/DPR, ch = canvas.height/DPR;
    const sx = cw/2 + (this.x - camRef.x) * camRef.zoom;
    const sy = ch/2 + (this.y - camRef.y) * camRef.zoom;
    const half = (this.sz/2) * camRef.zoom;
    this._drawHPScreen(c, sx, sy - half);
    this._drawXPBar(c, sx, sy - half);
    this._drawScrapCircle(c, sx, sy - half);
  }

  _drawXPBar(c, cx, topY) {
    const barW = 72, barH = 16;
    const hpBy = topY - barH - 6;
    const xh = 5;
    const xy = hpBy - xh - 3;
    const bx = cx - barW/2;
    const req = this.level >= 4 ? 1 : ENGI_XP_REQ[this.level + 1];
    const ratio = this.level >= 4 ? 1 : clamp(this.xp / req, 0, 1);
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.45)'; rrect(c, bx, xy, barW, xh, xh/2); c.fill();
    if (ratio > 0) {
      c.save(); rrect(c, bx, xy, barW, xh, xh/2); c.clip();
      c.fillStyle = '#2ECC71'; c.fillRect(bx, xy, barW * ratio, xh);
      c.restore();
    }
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1; rrect(c, bx, xy, barW, xh, xh/2); c.stroke();
    c.restore();
  }

  _drawScrapCircle(c, cx, topY) {
    const barW = 72, barH = 16;
    const hpBy = topY - barH - 6;
    const r = 13;
    const scx = cx + barW/2 + r + 6;
    const scy = hpBy + barH/2;
    c.save();
    c.fillStyle = 'rgba(20,20,20,0.85)';
    c.beginPath(); c.arc(scx, scy, r, 0, Math.PI*2); c.fill();
    c.strokeStyle = '#D4A017'; c.lineWidth = 2;
    c.beginPath(); c.arc(scx, scy, r, 0, Math.PI*2); c.stroke();
    c.font = 'bold 13px Arial Black,sans-serif'; c.textAlign = 'center';
    c.lineWidth = 2.5; c.strokeStyle = '#000';
    c.strokeText(this.scrap, scx, scy + 4);
    c.fillStyle = '#FFD700';
    c.fillText(this.scrap, scx, scy + 4);
    c.restore();
  }
}
