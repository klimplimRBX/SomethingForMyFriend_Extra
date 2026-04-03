// ── CUSTOM CHARACTER CLASS ──────────────────────────────────
class CustomCharacter extends Character {
  constructor(x, y, type) {
    super(x, y, type);
    const cfg = type.cfg;
    this.hp = cfg.hp; this.maxHp = cfg.hp;
    this._cfg = cfg;
    this._activeCfg = cfg;
    // sz controla hitbox de colisão; _drawSz controla o tamanho visual
    this.sz      = cfg.charHitbox || cfg.charSize || CHAR_SZ;
    this._drawSz = cfg.charSize   || CHAR_SZ;
    this._ratioX = (cfg.imgRatioX ?? 100) / 100;
    this._ratioY = (cfg.imgRatioY ?? 100) / 100;
    this._condTriggered = false;
    // timers
    this._damageSfxCd  = 0;
    this._rndSfxTimer  = 1 + Math.random();
    this._rndSfxPlaying= false;
    this._idleTimer    = 0;
    this._regenAccum   = 0;
    this._collDmgTimer = 0;
    // stun burst tracking
    this._burstHits    = 0;
    this._burstGap     = 0;
    // music
    this._musicKey     = null;
    this._musicStarted = false;
  }

  // ── helpers ──
  _getSpd(cfg) {
    if (cfg.moveSpeedMode==='slow')   return 100;
    if (cfg.moveSpeedMode==='fast')   return 250;
    if (cfg.moveSpeedMode==='custom') return cfg.moveSpeedCustom||165;
    return 165;
  }

  _makeProj(cfg, tgt) {
    let vx=0, vy=0, baseA;
    const spd = cfg.projSpeed;

    if (cfg.homing && cfg.homingMode==='predict') {
      // predictive intercept
      const dx=tgt.x-this.x, dy=tgt.y-this.y;
      const tvx=tgt.vx*(tgt.slowTimer>0?0.25:1);
      const tvy=tgt.vy*(tgt.slowTimer>0?0.25:1);
      const a2=tvx*tvx+tvy*tvy-spd*spd, b2=2*(dx*tvx+dy*tvy), c2=dx*dx+dy*dy;
      let t=0;
      if (Math.abs(a2)<0.001) { t=b2!==0?-c2/b2:0; }
      else {
        const disc=b2*b2-4*a2*c2;
        if (disc>=0) {
          const t1=(-b2+Math.sqrt(disc))/(2*a2), t2=(-b2-Math.sqrt(disc))/(2*a2);
          const pos=[t1,t2].filter(v=>v>0);
          t=pos.length?Math.min(...pos):0;
        }
      }
      t=Math.max(0,Math.min(t,2));
      baseA=Math.atan2(tgt.y+tvy*t-this.y, tgt.x+tvx*t-this.x);
    } else {
      baseA = Math.atan2(tgt.y-this.y, tgt.x-this.x);
    }

    const spr = (Math.random()-0.5)*cfg.spread*(Math.PI/180)*2;
    const ang  = baseA + spr;
    vx = Math.cos(ang)*spd; vy = Math.sin(ang)*spd;

    let p;
    const bouncy = cfg.bouncy;
    const direct = cfg.homing && cfg.homingMode==='direct';
    if (bouncy && direct) p = new BouncyHomingProj(this.x, this.y, vx, vy, this, tgt);
    else if (bouncy)      p = new BouncyProj(this.x, this.y, vx, vy, this);
    else if (direct)      p = new HomingProj(this.x, this.y, vx, vy, this, tgt);
    else                  p = new Proj(this.x, this.y, vx, vy, this);

    // visuals & stats
    const imgs = cfg._shotImgEls||[];
    if (imgs.length>0) p._customImg = imgs[(cfg.shots - this.burstQ.length - 1) % imgs.length];
    p._projSz   = cfg.projSize   || PROJ_SZ;
    p._hitboxSz = cfg.projHitbox || PROJ_SZ;
    p.dmg       = cfg.projDmg !== undefined ? cfg.projDmg : PROJ_DMG;
    p.healAmt   = cfg.projHeal  || 0;
    p._stunDur  = cfg.stunPerProj || 0;
    return p;
  }

  _shoot(dt, other, projs) {
    const cfg = this._activeCfg;
    this.charge = Math.min(1, this.charge + dt / cfg.reloadCooldown);
    if (this.charge >= 1 && other && other.alive && this.burstQ.length===0) {
      this.charge = 0;
      for (let i=0; i<cfg.shots; i++) this.burstQ.push(other);
      this.burstT = 0;
      if (cfg._sfxShootAllBuf) playSfxBuf(cfg._sfxShootAllBuf);
      else if (cfg._sfxShootOneBuf) playSfxBuf(cfg._sfxShootOneBuf);
    }
    if (this.burstQ.length > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        const tgt = this.burstQ.shift();
        if (tgt && tgt.alive) {
          const p = this._makeProj(cfg, tgt);
          projs.push(p);
          if (cfg._sfxShootOneBuf && !cfg._sfxShootAllBuf) playSfxBuf(cfg._sfxShootOneBuf);
        }
        this.burstT = cfg.shotInterval;
      }
    }
  }

  _move(dt, other) {
    const cfg = this._activeCfg;
    const sp = this.slowTimer > 0 ? 0.25 : 1;
    const spd = this._getSpd(cfg);
    // normalise speed without changing direction
    const curSpd = Math.hypot(this.vx, this.vy);
    if (curSpd > 0.01) { this.vx=this.vx/curSpd*spd; this.vy=this.vy/curSpd*spd; }

    this.x += this.vx*sp*dt; this.y += this.vy*sp*dt;
    const h = this.sz/2;
    if (this.x-h<0)  { this.x=h;    this.vx= Math.abs(this.vx); SFX.play('collide',0.8); }
    if (this.x+h>AW) { this.x=AW-h; this.vx=-Math.abs(this.vx); SFX.play('collide',0.8); }
    if (this.y-h<0)  { this.y=h;    this.vy= Math.abs(this.vy); SFX.play('collide',0.8); }
    if (this.y+h>AH) { this.y=AH-h; this.vy=-Math.abs(this.vy); SFX.play('collide',0.8); }

    if (!cfg.noCollide && other && other.alive && !other.noCollide && this._collideCD<=0) {
      const dx=other.x-this.x, dy=other.y-this.y;
      const d=Math.hypot(dx,dy), minD=(this.sz+other.sz)/2;
      if (d<minD && d>0.01) {
        const nx=dx/d, ny=dy/d, ov=(minD-d)*0.5;
        this.x-=nx*ov; this.y-=ny*ov;
        other.x+=nx*ov; other.y+=ny*ov;
        SFX.play('collide',0.8);
        this._collideCD=0.12; other._collideCD=0.12;
        // Collision damage
        if (cfg.collisionEnabled && cfg.collisionDamage > 0 && this._collDmgTimer <= 0) {
          other.takeDamage(cfg.collisionDamage);
          this._collDmgTimer = cfg.collisionInterval || 1.0;
        }
        const spd1=Math.hypot(this.vx,this.vy);
        const d1=this.vx*nx+this.vy*ny;
        if (d1>0) { this.vx-=2*d1*nx; this.vy-=2*d1*ny; }
        const ns1=Math.hypot(this.vx,this.vy);
        if (ns1>0.01) { this.vx=this.vx/ns1*spd1; this.vy=this.vy/ns1*spd1; }
        const spd2=Math.hypot(other.vx,other.vy);
        const d2=other.vx*(-nx)+other.vy*(-ny);
        if (d2>0) { other.vx-=2*d2*(-nx); other.vy-=2*d2*(-ny); }
        const ns2=Math.hypot(other.vx,other.vy);
        if (ns2>0.01) { other.vx=other.vx/ns2*spd2; other.vy=other.vy/ns2*spd2; }
      }
    }
  }

  // Called by G.update when one of our projs hits the target
  onProjHit(proj, target) {
    const cfg = this._activeCfg;
    // per-proj stun
    if (proj._stunDur > 0) {
      target.freezeTimer = Math.max(target.freezeTimer||0, proj._stunDur);
    }
    // burst stun — all N projs in sequence
    if (cfg.stunAllProjs > 0 && cfg.shots > 1) {
      this._burstHits++;
      this._burstGap = 0.6;
      if (this._burstHits >= cfg.shots) {
        target.freezeTimer = Math.max(target.freezeTimer||0, cfg.stunAllProjs);
        this._burstHits = 0; this._burstGap = 0;
      }
    }
  }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); return; }
    this.hitFlash   = Math.max(0, this.hitFlash-dt);
    this.slowTimer  = Math.max(0, this.slowTimer-dt);
    this.freezeTimer= Math.max(0, this.freezeTimer-dt);
    this._collideCD  = Math.max(0, this._collideCD-dt);
    this._damageSfxCd= Math.max(0, this._damageSfxCd-dt);
    this._collDmgTimer=Math.max(0, this._collDmgTimer-dt);
    if (this._burstGap > 0) {
      this._burstGap -= dt;
      if (this._burstGap <= 0) { this._burstHits=0; this._burstGap=0; }
    }

    // Condition check — swap to rage cfg
    if (!this._condTriggered && this._cfg.conditionEnabled &&
        this._cfg.conditionHP > 0 && this.hp <= this._cfg.conditionHP) {
      this._condTriggered = true;
      this._activeCfg = this._cfg._condCfgHydrated || this._cfg;
      // switch music if different
      const nc = this._activeCfg;
      if (nc._musicKey && nc._musicKey !== this._musicKey) {
        SFX.stopMusic(); SFX.playMusic(nc._musicKey, 0.8);
        this._musicKey = nc._musicKey;
      }
    }

    if (this.freezeTimer > 0) { this._tickLabel(dt); return; }

    // Start music (first frame)
    const cfg = this._activeCfg;
    if (cfg._musicKey && !this._musicStarted) {
      this._musicStarted = true;
      this._musicKey = cfg._musicKey;
      SFX.playMusic(cfg._musicKey, 0.8);
    }

    this._move(dt, other);
    this._shoot(dt, other, projs);

    // Passive regen
    if (cfg.passiveRegenIdle > 0 && cfg.passiveRegenHPS > 0) {
      this._idleTimer += dt;
      if (this._idleTimer >= cfg.passiveRegenIdle && this.hp < this.maxHp) {
        this._regenAccum += dt;
        if (this._regenAccum >= 1.0) {
          this._regenAccum -= 1.0;
          this.heal(cfg.passiveRegenHPS);
        }
      } else if (this._idleTimer < cfg.passiveRegenIdle) {
        this._regenAccum = 0;
      }
    }

    // Random SFX
    if (!this._rndSfxPlaying && cfg._sfxRandomBuf && cfg.sfxRandomProb > 0) {
      this._rndSfxTimer -= dt;
      if (this._rndSfxTimer <= 0) {
        this._rndSfxTimer = 1;
        if (Math.random() < cfg.sfxRandomProb / 100) {
          this._rndSfxPlaying = true;
          playSfxBuf(cfg._sfxRandomBuf, 1.0, () => { this._rndSfxPlaying=false; });
        }
      }
    }

    this._tickLabel(dt);
  }

  takeDamage(v) {
    super.takeDamage(v);
    const cfg = this._activeCfg;
    if (cfg._sfxDamageBuf && this._damageSfxCd <= 0) {
      playSfxBuf(cfg._sfxDamageBuf);
      this._damageSfxCd = 3.0;
    }
    this._idleTimer = 0; this._regenAccum = 0;
  }

  draw(c) {
    if (this.alive) {
      const sz  = this._drawSz;
      const rx  = this._ratioX;
      const ry  = this._ratioY;
      const dw  = sz * rx;
      const dh  = sz * ry;
      const cfg = this._activeCfg;
      const useHurt = this.hitFlash > 0 && cfg._hurtImgEl && imgOk(cfg._hurtImgEl);
      const img = useHurt ? cfg._hurtImgEl : cfg._charImgEl;
      if (img && imgOk(img)) {
        c.drawImage(img, this.x - dw/2, this.y - dh/2, dw, dh);
      } else {
        c.fillStyle = this.color;
        c.fillRect(this.x - dw/2, this.y - dh/2, dw, dh);
        c.strokeStyle='white'; c.lineWidth=3;
        c.strokeRect(this.x - dw/2, this.y - dh/2, dw, dh);
        c.fillStyle='white'; c.font='bold 11px Arial'; c.textAlign='center';
        c.fillText(this.name, this.x, this.y+4);
      }
      if (this.hitFlash > 0 && !useHurt && img && imgOk(img)) {
        const wt=getWhite(img); if (wt) c.drawImage(wt, this.x - dw/2, this.y - dh/2, dw, dh);
      }
      // Freeze overlay
      if (this.freezeTimer > 0) {
        c.save(); c.globalAlpha=0.4; c.fillStyle='#A0DFFF';
        c.fillRect(this.x - dw/2, this.y - dh/2, dw, dh); c.restore();
      }
    }
    this._drawLabels(c);
  }
}


