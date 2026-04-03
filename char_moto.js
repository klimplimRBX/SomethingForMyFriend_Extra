"use strict";

// ── MOTO PROJECTILE ────────────────────────────────────────────
// Depende de: AW, AH, MOTO_HOMING
const MOTO_PROJ_SPD = 2000;
const MOTO_HOMING   = 6.0; // turn rate rad/s

class MotoProj {
  constructor(x, y, vx, vy, owner, target) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.owner=owner; this.alive=true;
    this._target=target;
    this.trail=[]; // {x,y}
    this.dmg=100;
    this.healAmt=0;
  }
  update(dt) {
    // Homing
    if (this._target && this._target.alive) {
      const dx=this._target.x-this.x, dy=this._target.y-this.y;
      if (Math.hypot(dx,dy)>1) {
        const desired=Math.atan2(dy,dx);
        const cur=Math.atan2(this.vy,this.vx);
        let diff=desired-cur;
        while(diff> Math.PI) diff-=Math.PI*2;
        while(diff<-Math.PI) diff+=Math.PI*2;
        const turn=Math.sign(diff)*Math.min(Math.abs(diff),MOTO_HOMING*dt);
        const newA=cur+turn, spd=Math.hypot(this.vx,this.vy);
        this.vx=Math.cos(newA)*spd; this.vy=Math.sin(newA)*spd;
      }
    }
    this.trail.push({x:this.x,y:this.y});
    if (this.trail.length>18) this.trail.shift();
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    if (this.x<-40||this.x>AW+40||this.y<-40||this.y>AH+40) this.alive=false;
  }
  hits(c) {
    const r=c.sz/2+6;
    return Math.abs(this.x-c.x)<r && Math.abs(this.y-c.y)<r;
  }
  draw(c) {
    if (!this.alive) return;
    // Yellow trail
    const ang=Math.atan2(this.vy,this.vx);
    for (let i=1;i<this.trail.length;i++) {
      const t=i/this.trail.length;
      c.save();
      c.globalAlpha=t*0.35;
      c.strokeStyle='#FFE000';
      c.lineWidth=3*t;
      c.beginPath();
      c.moveTo(this.trail[i-1].x,this.trail[i-1].y);
      c.lineTo(this.trail[i].x,this.trail[i].y);
      c.stroke();
      c.restore();
    }
    // Thin rectangle bullet
    c.save();
    c.translate(this.x,this.y);
    c.rotate(ang);
    c.fillStyle='#FFE000';
    c.fillRect(-18,-3,36,6);
    c.fillStyle='white';
    c.fillRect(-18,-1,36,2);
    c.restore();
  }
}

// ── MOTO CHARACTER ─────────────────────────────────────────────
// Depende de: Character, MotoProj, MOTO_IMG, BAIANO_Z_WINDOW,
//             AW, AH, SFX, imgOk, getWhite
const MOTO_CHARGE_T = 2.5;
const MOTO_RUN_DMG  = 25;   // dano a cada 0.25s
const MOTO_RUN_INT  = 0.30; // intervalo do atropelamento

class MotoCharacter extends Character {
  constructor(x,y,type) {
    super(x,y,type);
    this.hp=1200; this.maxHp=1200;
    this.noCollide = true;   // hitbox fantasma — outros passam sem colidir
    this._runAcc   = 0;
    this._faceAng  = 0;      // ângulo visual pra olhar pro oponente
    this._other    = null;
  }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); return; }
    this.hitFlash  = Math.max(0, this.hitFlash-dt);
    this.slowTimer = Math.max(0, this.slowTimer-dt);
    this.freezeTimer = Math.max(0, this.freezeTimer-dt);
    this._other = other;
    if (this._zHits > 0) {
      this._zGapTimer += dt;
      if (this._zGapTimer >= BAIANO_Z_WINDOW) { this._zHits=0; this._zGapTimer=0; }
    }
    // Atualiza ângulo visual — sempre olhando pro oponente
    if (other && other.alive) {
      this._faceAng = Math.atan2(other.y-this.y, other.x-this.x);
    }
    if (this.freezeTimer > 0) { this._tickLabel(dt); return; }
    this._move(dt, other);
    this._shoot(dt, other, projs);
    this._tickLabel(dt);
  }

  _move(dt, other) {
    // Ignora slow, ignora toda colisão
    this.x += this.vx*dt; this.y += this.vy*dt;
    const h = this.sz/2;
    if (this.x-h<0)  { this.x=h;    this.vx= Math.abs(this.vx); SFX.play('collide',0.4); }
    if (this.x+h>AW) { this.x=AW-h; this.vx=-Math.abs(this.vx); SFX.play('collide',0.4); }
    if (this.y-h<0)  { this.y=h;    this.vy= Math.abs(this.vy); SFX.play('collide',0.4); }
    if (this.y+h>AH) { this.y=AH-h; this.vy=-Math.abs(this.vy); SFX.play('collide',0.4); }

    // Atropelamento: hitbox de dano independente, sem física
    if (other && other.alive) {
      const d = Math.hypot(this.x-other.x, this.y-other.y);
      if (d < this.sz) {
        this._runAcc = Math.max(0, this._runAcc - dt);
        if (this._runAcc <= 0) {
          other.takeDamage(MOTO_RUN_DMG);
          this._runAcc = MOTO_RUN_INT;
        }
      } else {
        this._runAcc = 0;
      }
    }
  }

  _shoot(dt, other, projs) {
    this.charge = Math.min(1, this.charge+dt/MOTO_CHARGE_T);
    if (this.charge >= 1 && other && other.alive) {
      this.charge = 0;
      SFX.play('gun', 1.0);
      const a = Math.atan2(other.y-this.y, other.x-this.x);
      projs.push(new MotoProj(this.x, this.y, Math.cos(a)*MOTO_PROJ_SPD, Math.sin(a)*MOTO_PROJ_SPD, this, other));
    }
  }

  draw(c) {
    if (this.alive) {
      const sz = this.sz;
      const facingLeft = this._other && this._other.x < this.x;
      c.save();
      c.translate(this.x, this.y);
      c.scale(facingLeft ? -1 : 1, 1);
      if (imgOk(MOTO_IMG)) {
        c.drawImage(MOTO_IMG, -sz/2, -sz/2, sz, sz);
      } else {
        c.fillStyle = this.color;
        c.fillRect(-sz/2, -sz/2, sz, sz);
        c.strokeStyle = 'white'; c.lineWidth = 3;
        c.strokeRect(-sz/2, -sz/2, sz, sz);
      }
      if (this.hitFlash > 0) {
        const _wm=getWhite(MOTO_IMG);
        if (_wm) c.drawImage(_wm,-sz/2,-sz/2,sz,sz);
      }
      c.restore();
    }
    this._drawLabels(c);
  }
}
