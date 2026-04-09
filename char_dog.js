class DogCharacter extends Character {
  constructor(x, y, type) {
    super(x, y, type);
    this.sz = DOG_SZ;
    this.hp = DOG_HP1; this.maxHp = DOG_HP1;
    this._phase       = 1;
    this._fakeDying   = false; // triggered when hp reaches 0 in phase 1
    this._evadeTimer  = 0;
    this._evading     = false;
    this._evadeAlpha  = 1;
    this._reflected   = false;
    this._reflectTimer = 0;
    this._nah         = null;   // {timer}
    this._dogMsg      = null;
    this._subPhase    = 0;         // 0=evade, 1=reflect, 2=final
  }

  _shoot(dt, other, projs) { /* Dog does not attack */ }

  takeDamage(v) {
    if (this._fakeDying) return;
    if (this._phase === 2) {
      // Phase 2 sub-phases handle damage themselves in G
      return;
    }
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - v);
    this.hitFlash = HIT_FLASH; this.slowTimer = SLOW_DUR;
    this.dmgStack += v; this.dmgWin = STACK_WIN;
    if (this.dmgLabel) { this.dmgLabel.val = this.dmgStack; }
    else { this.dmgLabel = {val:this.dmgStack, x:this.x, y:this.y+this.sz/2+22, fade:1.8}; }
    if (this.hp <= 0) {
      // Fake death — keep alive=true to prevent normal game over
      this._fakeDying = true;
      SFX.play('hit', 0.1);
    } else {
      SFX.play('hit', 0.2);
    }
  }

  // Phase 2: called by G when a proj hits the dog
  reflectProj(proj, other) {
    const dx = other.x - proj.x, dy = other.y - proj.y;
    const len = Math.hypot(dx, dy) || 1;
    proj.vx = dx/len*1500; proj.vy = dy/len*1500;
    proj.owner = this;
    proj._homingTarget = other; // teleguiado
  }

  _showMsg(text, timer) { this._dogMsg = {text, timer: timer||1.5}; }

  update(dt, other, projs) {
    if (this._fakeDying || !this.alive) { this._tickLabel(dt); this._tickDogMsg(dt); return; }
    this.hitFlash  = Math.max(0, this.hitFlash-dt);
    this.slowTimer = Math.max(0, this.slowTimer-dt);
    this.freezeTimer = Math.max(0, this.freezeTimer-dt);
    this._collideCD = Math.max(0, this._collideCD-dt);
    if (this.freezeTimer > 0) { this._tickLabel(dt); return; }
    this._tickEvade(dt, projs, other);
    if (!this._evading) this._move(dt, other);
    this._tickLabel(dt);
    this._tickDogMsg(dt);
  }

  _tickEvade(dt, projs, other) {
    if (this._phase !== 2) return;
    if (this._evading) {
      this._evadeTimer -= dt;
      this._evadeAlpha = 1; // sem fade — aparece/desaparece instantâneo
      if (this._evadeTimer <= 0) {
        const safe = this._findSafeSpot(projs, other);
        this.x = safe.x; this.y = safe.y;
        this._evading = false; this._evadeAlpha = 1;
      }
      return;
    }
    // Só desvia em subPhase 0, ou em subPhase 1 se inimigo < 300 HP
    const shouldEvade = this._subPhase === 0 ||
      (this._subPhase === 1 && other && other.hp < 300);
    if (!shouldEvade) return;
    if (this._isThreatened(projs)) {
      this._evading = true;
      this._evadeTimer = DOG_TELEPORT_DUR;
      SFX.play('teleport', 1.0);
    }
  }

  _isThreatened(projs) {
    for (const p of projs) {
      if (!p.alive || p.owner === this) continue;
      const tdx = this.x - p.x, tdy = this.y - p.y;
      const dist = Math.hypot(tdx, tdy);
      if (dist > 380) continue;
      const spd = Math.hypot(p.vx, p.vy);
      if (spd < 0.1) continue;
      const dot = (p.vx*tdx + p.vy*tdy) / (spd * dist);
      if (dot < 0.55) continue; // não está na direção do cachorro
      const nx = p.vx/spd, ny = p.vy/spd;
      const cross = tdx*ny - tdy*nx; // distância perpendicular da trajetória
      if (Math.abs(cross) < this.sz/2 + 16) return true;
    }
    return false;
  }

  _findSafeSpot(projs, other) {
    const h = this.sz/2 + 20; // margem de borda maior
    const safetyRadius = this.sz/2 + 50; // distância mínima da trajetória dos projéteis
    for (let tries = 0; tries < 80; tries++) {
      const x = h + Math.random()*(AW - h*2);
      const y = h + Math.random()*(AH - h*2);
      if (other && Math.hypot(x-other.x, y-other.y) < 100) continue;
      let safe = true;
      for (const p of projs) {
        if (!p.alive || p.owner===this) continue;
        const tdx = x - p.x, tdy = y - p.y;
        const dist = Math.hypot(tdx, tdy);
        const spd = Math.hypot(p.vx, p.vy);
        if (spd < 0.1) continue;
        // Considera ameaça mesmo de projéteis mais distantes
        if (dist > 600) continue;
        const dot = (p.vx*tdx + p.vy*tdy)/(spd * (dist||1));
        if (dot < 0.4) continue; // ângulo mais amplo de detecção
        const nx = p.vx/spd, ny = p.vy/spd;
        const cross = tdx*ny - tdy*nx;
        if (Math.abs(cross) < safetyRadius) { safe=false; break; }
      }
      if (safe) return {x, y};
    }
    // Fallback: canto mais longe dos projéteis
    const corners = [{x:h,y:h},{x:AW-h,y:h},{x:h,y:AH-h},{x:AW-h,y:AH-h}];
    let best = corners[0], bestScore = -Infinity;
    for (const pt of corners) {
      let minDist = Infinity;
      for (const p of projs) {
        if (!p.alive || p.owner===this) continue;
        minDist = Math.min(minDist, Math.hypot(pt.x-p.x, pt.y-p.y));
      }
      if (minDist > bestScore) { bestScore=minDist; best=pt; }
    }
    return best;
  }

  draw(c) {
    if (this._fakeDying) return;
    if (this.alive) {
      const sz = this.sz;
      c.save();
      if (imgOk(DOG_IMGS.MainDog)) {
        c.drawImage(DOG_IMGS.MainDog, this.x-sz/2, this.y-sz/2, sz, sz);
      } else {
        c.fillStyle = this.color; c.fillRect(this.x-sz/2, this.y-sz/2, sz, sz);
        c.strokeStyle='white'; c.lineWidth=3; c.strokeRect(this.x-sz/2, this.y-sz/2, sz, sz);
      }
      if (this.hitFlash > 0) {
        const wt = getWhite(DOG_IMGS.MainDog);
        if (wt) c.drawImage(wt, this.x-sz/2, this.y-sz/2, sz, sz);
      }
      c.restore();
      if (this._dogMsg) this._drawDogMsg(c);
    }
    this._drawLabels(c);
  }

  _drawDogMsg(c) {
    if (!this._dogMsg) return;
    const fade = Math.min(1, this._dogMsg.timer/0.4);
    c.save(); c.globalAlpha=fade; c.textAlign='center';
    c.font='bold 18px Arial Black,sans-serif'; c.lineWidth=4;
    c.strokeStyle='rgba(0,0,0,0.9)';
    c.strokeText(this._dogMsg.text, this.x, this.y-this.sz/2-32);
    c.fillStyle='#FFD700';
    c.fillText(this._dogMsg.text, this.x, this.y-this.sz/2-32);
    c.restore();
  }

  _tickDogMsg(dt) {
    if (!this._dogMsg) return;
    this._dogMsg.timer -= dt;
    if (this._dogMsg.timer <= 0) this._dogMsg = null;
  }

  _drawHPScreen(c, cx, topY) {
    if (this._phase === 2) {
      // Rainbow HP bar
      const barW=72, barH=16, r=barH/2;
      const bx=cx-barW/2, by=topY-barH-6;
      const hpRatio=clamp(this.hp/this.maxHp,0,1);
      const hue=(Date.now()/8)%360;
      c.save();
      c.fillStyle='rgba(0,0,0,0.35)'; rrect(c,bx+2,by+2,barW,barH,r); c.fill();
      c.fillStyle='#1a1a1a'; rrect(c,bx,by,barW,barH,r); c.fill();
      if (hpRatio>0) {
        c.save(); rrect(c,bx,by,barW,barH,r); c.clip();
        c.fillStyle=`hsl(${hue},100%,55%)`;
        c.fillRect(bx,by,barW*hpRatio,barH); c.restore();
      }
      c.strokeStyle='#000'; c.lineWidth=2; rrect(c,bx,by,barW,barH,r); c.stroke();
      // Rainbow + symbol — mesma hue que a barra
      c.font='bold 22px Arial Black,sans-serif';
      c.fillStyle=`hsl(${hue},100%,55%)`; c.textAlign='center';
      c.lineWidth=3; c.strokeStyle='#000';
      c.strokeText('+',bx-11,by+barH/2+7); c.fillText('+',bx-11,by+barH/2+7);
      c.font='bold 10px Arial Black,sans-serif'; c.lineWidth=2.5; c.strokeStyle='#000';
      c.strokeText(Math.ceil(this.hp),cx,by+barH/2+4);
      c.fillStyle='white'; c.fillText(Math.ceil(this.hp),cx,by+barH/2+4);
      c.restore();
    } else {
      super._drawHPScreen(c, cx, topY);
    }
  }
}
