"use strict";

// ── TOXIC DARTER ────────────────────────────────────────────────
// Depende de: Character, Proj, TOXICDARTER_IMGS, TOXICDART_PROJ_IMG, AW, AH, SFX,
//             imgOk, getWhite, clamp, lerp, rrect, canvas, DPR, cam

// ── CONSTANTS (da spec) ──────────────────────────────────────────
const TXD_HP              = 1080; // BUFF: era 987 — mais fôlego pro playstyle mais agressivo
const TXD_DART_DMG        = 80;  // BUFF: era 65
const TXD_POISON_DMG_TICK = 30;  // BUFF: era 25
const TXD_POISON_TICKS    = 3;
const TXD_POISON_TICK_RATE= 1.0; // 1 tick/s
const TXD_CD               = 1.2; // BUFF: era 1.5
const TXD_DART_SPD         = 900;
const TXD_TINT_DUR         = 0.5;

const TXD_START_POSE_DUR   = 1.0; // Front só nesse 1s inicial, nunca mais
const TXD_READY_POSE_DUR   = 1.0; // fica no Ready por 1s após atirar

// ── DEBUFF ao decair veneno (stack até o cap) ────────────────────
const TXD_DEBUFF_SPREAD_STEP = 1;    // graus por stack
const TXD_DEBUFF_DMG_STEP    = 0.10; // -10% por stack
const TXD_DEBUFF_SPD_STEP    = 0.10; // -10% por stack
const TXD_DEBUFF_CD_STEP     = 0.10; // +10% por stack
const TXD_DEBUFF_MAX_STACKS  = 5;    // cap: +5 spread / -50% dano / -50% vel / +50% cd

// ── XP de veneno ──────────────────────────────────────────────────
const TXD_XP_MAX          = 100;
const TXD_XP_PER_TICK     = 10;
const TXD_XP_PER_HIT      = 15;
const TXD_XP_PER_DEBUFF   = 20;
const TXD_XP_LOST_ON_HIT  = 1;
const TXD_XP_PER_POOL     = 5;

// ── Super dardo (ao encher XP) ────────────────────────────────────
const TXD_SUPER_DMG            = 110; // BUFF: era 90
const TXD_SUPER_TICKS          = 3;
const TXD_SUPER_TICK_RATE      = 0.5;
const TXD_SUPER_DMG_TICK       = 60;  // BUFF: era 50
const TXD_SUPER_SPD            = 1050;
const TXD_DRIPPING_DUR         = 3.0;  // duração do status PoisonDripping
const TXD_POOL_SPAWN_INTERVAL  = 0.5;
const TXD_POOL_LIFE            = 5.0;  // cada piscina dura 5s
const TXD_POOL_RADIUS          = 46;
const TXD_POOL_SLOW            = 0.20; // -20% velocidade
const TXD_POOL_DPS             = 30;   // BUFF: era 25
const TXD_POOL_SPREAD_ADD      = 5;
const TXD_POOL_MAX             = 4;    // pedido do usuário: no máximo 4 piscinas vivas ao mesmo tempo

// ── ASSUNÇÕES (não estavam na spec) ────────────────────────────────
const TXD_VISUAL_SZ = 1.0; // sem escala visual especial, ao contrário da Dark Ninja

// Anima cada piscina: gira lentamente e faz partículas nascerem/sumirem com o tempo
// (chamado 1x por frame em _tickPools — mantém a física e o visual sincronizados)
function _txdAnimatePool(pool, dt) {
  pool.rot = (pool.rot || 0) + dt * 0.5; // giro lento e contínuo
  pool.bubbleT = (pool.bubbleT || 0) - dt;
  if (pool.bubbleT <= 0) {
    pool.bubbleT = 0.15 + Math.random() * 0.2;
    pool.bubbles.push({
      ang: Math.random() * Math.PI * 2,
      dist: 0.15 + Math.random() * 0.6,
      size: 0.05 + Math.random() * 0.08,
      age: 0,
      life: 0.7 + Math.random() * 0.8,
    });
  }
  for (let i = pool.bubbles.length - 1; i >= 0; i--) {
    const b = pool.bubbles[i];
    b.age += dt;
    if (b.age >= b.life) pool.bubbles.splice(i, 1);
  }
}

// ── PROJÉTIL: DARDO DE VENENO ─────────────────────────────────────
class ToxicDartProj extends Proj {
  constructor(x, y, vx, vy, owner, isSuper) {
    super(x, y, vx, vy, owner);
    this._isSuper = !!isSuper;
    this.dmg = isSuper ? TXD_SUPER_DMG : TXD_DART_DMG;
    this._projSz = isSuper ? 30 : 20;
    this._hitboxSz = isSuper ? 22 : 14;
    this._customImg = TOXICDART_PROJ_IMG;
    this._rotateToVel = true;
  }
}

// ── TOXIC DARTER CHARACTER ─────────────────────────────────────────
class ToxicDarterCharacter extends Character {
  constructor(x, y, type) {
    super(x, y, type);
    this.hp = TXD_HP; this.maxHp = TXD_HP;
    this.spread = 0; // mira com predição, sem spread aleatório próprio

    this.xp = 0;

    this._startT = TXD_START_POSE_DUR;
    this._cd = TXD_CD; // já pronto pro primeiro tiro assim que sair do pose inicial
    this._readyT = 0;

    this._pools = []; // piscinas de veneno que ELE criou (dono: ele, afeta o inimigo)
    this._poolSpawnT = 0;
    this._drippingT = 0; // quanto tempo resta do status PoisonDripping no inimigo
    this._lastOther = null;
    this._lastOtherX = x; this._lastOtherY = y;
  }

  // ── XP ────────────────────────────────────────────────────────
  _gainXp(v, other) {
    this.xp = clamp(this.xp + v, 0, TXD_XP_MAX);
    if (this.xp >= TXD_XP_MAX && other && other.alive) {
      this.xp = 0;
      this._fireSuperDart(other);
    }
  }

  // Perde XP ao ser atingido
  takeDamage(v, noSlow) {
    super.takeDamage(v, noSlow);
    this.xp = clamp(this.xp - TXD_XP_LOST_ON_HIT, 0, TXD_XP_MAX);
  }

  // ── APLICAÇÃO DE VENENO (chamado via onProjHit, hook genérico do game.js) ──
  onProjHit(p, target) {
    if (!target.alive) return;
    if (p._isSuper) this._applySuperHit(target);
    else this._applyDartHit(target);
  }

  _applyDartHit(target) {
    if (target._toxPoison && target._toxPoison.owner === this) {
      // ── DECAY: funde o veneno acumulado (antigo + novo) num só tick ──
      const old = target._toxPoison;
      const oldRemaining = old.ticksLeft * old.dmgPerTick;
      const newTotal = TXD_POISON_TICKS * TXD_POISON_DMG_TICK;
      target.takeDamage(oldRemaining + newTotal, true);
      target._toxPoison = null;
      target._poisonTintT = TXD_TINT_DUR;
      SFX.play('poisonDecay', 0.9);
      this._stackDebuff(target);
      this._gainXp(TXD_XP_PER_HIT + TXD_XP_PER_DEBUFF, target);
    } else {
      target._toxPoison = {
        owner: this, ticksLeft: TXD_POISON_TICKS,
        tickTimer: TXD_POISON_TICK_RATE, dmgPerTick: TXD_POISON_DMG_TICK,
      };
      this._gainXp(TXD_XP_PER_HIT, target);
    }
  }

  _applySuperHit(target) {
    // Super dardo não funde/decai veneno existente nem conta pro debuff — só aplica seu próprio DoT.
    target._toxPoison = {
      owner: this, ticksLeft: TXD_SUPER_TICKS,
      tickTimer: TXD_SUPER_TICK_RATE, dmgPerTick: TXD_SUPER_DMG_TICK,
      tickRate: TXD_SUPER_TICK_RATE,
    };
    target._poisonTintT = TXD_TINT_DUR;
    this._drippingT = TXD_DRIPPING_DUR;
    this._poolSpawnT = 0;
  }

  _stackDebuff(target) {
    const s = Math.min(TXD_DEBUFF_MAX_STACKS, (target._txdDebuffStacks || 0) + 1);
    target._txdDebuffStacks = s;
    target.spreadAddDeg = s * TXD_DEBUFF_SPREAD_STEP;
    target.dmgMult   = 1 - s * TXD_DEBUFF_DMG_STEP;
    target.speedMult = 1 - s * TXD_DEBUFF_SPD_STEP;
    target.cdMult    = 1 + s * TXD_DEBUFF_CD_STEP;
  }

  _fireSuperDart(other) {
    const lead = this._predictAim(other, TXD_SUPER_SPD);
    const a = Math.atan2(lead.y - this.y, lead.x - this.x);
    this._pendingSuperShot = { vx: Math.cos(a) * TXD_SUPER_SPD, vy: Math.sin(a) * TXD_SUPER_SPD };
    this._readyT = TXD_READY_POSE_DUR;
  }

  // Mira com predição simples (1 iteração) baseada na velocidade atual do alvo
  _predictAim(other, projSpd) {
    const dx = other.x - this.x, dy = other.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const t = dist / projSpd;
    return { x: other.x + (other.vx || 0) * t, y: other.y + (other.vy || 0) * t };
  }

  // ── UPDATE ────────────────────────────────────────────────────
  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); this._tickPoisonTint(dt); return; }
    this._lastOther = other;

    this.hitFlash    = Math.max(0, this.hitFlash - dt);
    this.slowTimer    = Math.max(0, this.slowTimer - dt);
    this.freezeTimer  = Math.max(0, this.freezeTimer - dt);
    this._collideCD   = Math.max(0, this._collideCD - dt);
    this._readyT      = Math.max(0, this._readyT - dt);
    this._startT       = Math.max(0, this._startT - dt);

    this._move(dt, other);
    this._tickPoisonTick(dt, other);
    this._tickPools(dt, other);
    this._tickLabel(dt);

    if (this.freezeTimer > 0) return;

    // Tiro pendente do super dardo (agendado quando a XP encheu)
    if (this._pendingSuperShot && other && other.alive) {
      const s = this._pendingSuperShot; this._pendingSuperShot = null;
      const p = new ToxicDartProj(this.x, this.y, s.vx, s.vy, this, true);
      projs.push(p);
      SFX.play('toxicDartAttack', 0.4);
      return;
    }

    if (this._startT > 0) return; // primeiro 1s da partida: só pose Front, sem atacar

    this._cd = Math.max(0, this._cd - dt);
    if (this._cd <= 0 && other && other.alive) {
      this._cd = TXD_CD;
      const lead = this._predictAim(other, TXD_DART_SPD);
      const a = Math.atan2(lead.y - this.y, lead.x - this.x);
      const p = new ToxicDartProj(this.x, this.y, Math.cos(a) * TXD_DART_SPD, Math.sin(a) * TXD_DART_SPD, this, false);
      projs.push(p);
      SFX.playPitched('toxicDartAttack', -1, 1, 0.25);
      this._readyT = TXD_READY_POSE_DUR;
    }
  }

  // ── VENENO NO INIMIGO (tick da DoT que ESTE Toxic Darter aplicou) ──
  _tickPoisonTick(dt, other) {
    if (!other || !other.alive) return;
    const st = other._toxPoison;
    if (!st || st.owner !== this) return;
    st.tickTimer -= dt;
    if (st.tickTimer <= 0 && st.ticksLeft > 0) {
      st.tickTimer = st.tickRate || TXD_POISON_TICK_RATE;
      other.takeDamage(st.dmgPerTick, true);
      other._poisonTintT = TXD_TINT_DUR;
      st.ticksLeft--;
      this._gainXp(TXD_XP_PER_TICK, other);
      if (st.ticksLeft <= 0) other._toxPoison = null;
    }
  }

  _tickPoisonTint(dt) { /* decaimento do tint é feito centralmente no draw via game.js */ }

  // ── PISCINAS DE VENENO (do status PoisonDripping, após o super dardo) ──
  _tickPools(dt, other) {
    this._drippingT = Math.max(0, this._drippingT - dt);
    if (this._drippingT > 0 && other && other.alive) {
      const moved = Math.hypot(other.x - this._lastOtherX, other.y - this._lastOtherY) > 0.5;
      this._poolSpawnT -= dt;
      if (moved && this._poolSpawnT <= 0) {
        this._poolSpawnT = TXD_POOL_SPAWN_INTERVAL;
        if (this._pools.length >= TXD_POOL_MAX) this._pools.shift(); // remove a mais antiga
        this._pools.push({ x: other.x, y: other.y, life: TXD_POOL_LIFE, rot: Math.random() * Math.PI * 2, bubbleT: 0, bubbles: [] });
      }
    }
    for (let i = this._pools.length - 1; i >= 0; i--) {
      this._pools[i].life -= dt;
      if (this._pools[i].life <= 0) { this._pools.splice(i, 1); continue; }
      _txdAnimatePool(this._pools[i], dt);
    }

    // Colisão: o inimigo só recebe efeito de UMA piscina por vez, mesmo se estiver
    // sobre várias — pega a primeira que encontrar.
    let inPool = false;
    if (other && other.alive) {
      for (const pool of this._pools) {
        const d = Math.hypot(other.x - pool.x, other.y - pool.y);
        if (d <= TXD_POOL_RADIUS) { inPool = true; break; }
      }
    }
    if (other && other.alive) {
      if (inPool) {
        if (other._txdPoolTickT === undefined) other._txdPoolTickT = 1.0;
        other._txdPoolTickT -= dt;
        other.speedMult = Math.min(other.speedMult, 1 - TXD_POOL_SLOW);
        other.spreadAddDeg = Math.max(other.spreadAddDeg, TXD_POOL_SPREAD_ADD);
        if (other._txdPoolTickT <= 0) {
          other._txdPoolTickT = 1.0;
          other.takeDamage(TXD_POOL_DPS, true);
          this._gainXp(TXD_XP_PER_POOL, other);
        }
      } else if (other._txdInPoolPrev) {
        // saiu da piscina: restaura o piso do debuff de stack (se houver) em vez do da piscina
        const s = other._txdDebuffStacks || 0;
        other.speedMult = 1 - s * TXD_DEBUFF_SPD_STEP;
        other.spreadAddDeg = s * TXD_DEBUFF_SPREAD_STEP;
      }
      other._txdInPoolPrev = inPool;
    }

    if (other && other.alive) { this._lastOtherX = other.x; this._lastOtherY = other.y; }
  }

  // ── SPRITE ATUAL ─────────────────────────────────────────────
  _currentImgKey(facingLeft) {
    if (this._startT > 0) return 'Front';
    if (this._readyT > 0) return 'Ready';
    return facingLeft ? 'Left' : 'Right';
  }

  draw(c) {
    if (!this.alive) { this._drawLabels(c); return; }

    const other = this._lastOther;
    const facingLeft = other && other.alive && other.x < this.x;
    const key = this._currentImgKey(facingLeft);
    // Só existe UMA imagem de Ready (feita olhando pra direita) — espelha na hora
    // se o ataque precisa sair pra esquerda. Front/Left/Right já são sprites distintos.
    const mustFlip = key === 'Ready' && facingLeft;
    const img = TOXICDARTER_IMGS[key];
    const sz = this.sz * TXD_VISUAL_SZ;

    c.save();
    c.translate(this.x, this.y);
    c.scale(mustFlip ? -1 : 1, 1);
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
    this._drawLabels(c);
  }

  _drawPoisonPools(c) {
    for (const pool of this._pools) {
      const a = clamp(pool.life / TXD_POOL_LIFE, 0, 1);
      const r = TXD_POOL_RADIUS;
      c.save();

      // Brilho externo suave
      c.globalAlpha = 0.55 * a;
      const glow = c.createRadialGradient(pool.x, pool.y, r * 0.2, pool.x, pool.y, r * 1.4);
      glow.addColorStop(0, 'rgba(70,230,130,0.55)');
      glow.addColorStop(1, 'rgba(70,230,130,0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(pool.x, pool.y, r * 1.4, 0, Math.PI * 2); c.fill();

      // Corpo da piscina (gradiente escuro nas bordas, claro no centro)
      c.globalAlpha = 0.9 * a;
      const body = c.createRadialGradient(pool.x, pool.y, 2, pool.x, pool.y, r);
      body.addColorStop(0,    '#6BEF95');
      body.addColorStop(0.55, '#2E9E52');
      body.addColorStop(1,    '#0B4A20');
      c.fillStyle = body;
      c.beginPath(); c.arc(pool.x, pool.y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(6,50,18,0.7)'; c.lineWidth = 2; c.stroke();

      // Partículas girando, nascendo e sumindo aos poucos
      for (const b of pool.bubbles) {
        const life = clamp(b.age / b.life, 0, 1);
        // envelope: some rápido, segura, some rápido de novo
        const env = life < 0.2 ? life / 0.2 : (life > 0.75 ? (1 - life) / 0.25 : 1);
        const ang = b.ang + pool.rot;
        const bx = pool.x + Math.cos(ang) * b.dist * r;
        const by = pool.y + Math.sin(ang) * b.dist * r;
        c.globalAlpha = 0.75 * a * env;
        c.fillStyle = '#C7FBD6';
        c.beginPath(); c.arc(bx, by, b.size * r, 0, Math.PI * 2); c.fill();
      }

      c.restore();
    }
  }

  drawHUD(c, camRef) {
    if (!this.alive) return;
    const cw = canvas.width / DPR, ch = canvas.height / DPR;
    const sx = cw / 2 + (this.x - camRef.x) * camRef.zoom;
    const sy = ch / 2 + (this.y - camRef.y) * camRef.zoom;
    const half = (this.sz / 2) * camRef.zoom;
    this._drawHPScreen(c, sx, sy - half);
    this._drawXpBar(c, sx, sy - half);
  }

  _drawXpBar(c, cx, topY) {
    const barW = 80, barH = 14;
    const hpBy = topY - 22;
    const y = hpBy - barH - 3;
    const bx = cx - barW / 2;
    const ratio = clamp(this.xp / TXD_XP_MAX, 0, 1);
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.55)'; rrect(c, bx, y, barW, barH, barH / 2); c.fill();
    if (ratio > 0) {
      c.save(); rrect(c, bx, y, barW, barH, barH / 2); c.clip();
      c.fillStyle = '#3E8E41'; c.fillRect(bx, y, barW * ratio, barH);
      c.restore();
    }
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 1; rrect(c, bx, y, barW, barH, barH / 2); c.stroke();
    c.font = `bold ${barH - 2}px Arial Black,sans-serif`; c.textAlign = 'center';
    c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.9)';
    const label = Math.floor(this.xp) + '%';
    c.strokeText(label, cx, y + barH - 2);
    c.fillStyle = 'white'; c.fillText(label, cx, y + barH - 2);
    c.restore();
  }
}
