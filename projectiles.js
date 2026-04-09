"use strict";

// ── PROJECTILE (base) ──────────────────────────────────────────
// Depende de: PROJ_SZ, PROJ_COLOR, AW, AH, imgOk
class Proj {
  constructor(x,y,vx,vy,owner) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.owner=owner; this.alive=true; this.trail=[];
    this.dmg=undefined; this.healAmt=0;
    this._projSz=PROJ_SZ; this._hitboxSz=PROJ_SZ;
  }
  update(dt) {
    this.trail.push({x:this.x, y:this.y});
    if (this.trail.length>7) this.trail.shift();
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const r=this._projSz/2;
    if (this.x-r<0||this.x+r>AW||this.y-r<0||this.y+r>AH) this.alive=false;
  }
  hits(c) {
    const r=c.sz/2+1.5+this._hitboxSz/2;
    return Math.abs(this.x-c.x)<r && Math.abs(this.y-c.y)<r;
  }
  draw(c) {
    if (!this.alive) return;
    for (let i=0;i<this.trail.length;i++) {
      const t=i/this.trail.length, sz=this._projSz*t*0.75;
      c.save(); c.globalAlpha=t*0.5;
      c.fillStyle=PROJ_COLOR;
      c.fillRect(this.trail[i].x-sz/2,this.trail[i].y-sz/2,sz,sz);
      c.restore();
    }
    const s=this._projSz;
    if (this._customImg && imgOk(this._customImg)) {
      c.drawImage(this._customImg, this.x-s/2, this.y-s/2, s, s);
    } else {
      c.fillStyle=PROJ_COLOR; c.fillRect(this.x-s/2,this.y-s/2,s,s);
      c.strokeStyle='rgba(255,255,255,0.6)'; c.lineWidth=2;
      c.strokeRect(this.x-s/2,this.y-s/2,s,s);
    }
  }
}

// ── BOUNCY PROJECTILE ──────────────────────────────────────────
class BouncyProj extends Proj {
  constructor(x, y, vx, vy, owner) {
    super(x, y, vx, vy, owner);
    this._bounces = 0;
  }
  update(dt) {
    this.trail.push({x:this.x, y:this.y});
    if (this.trail.length>9) this.trail.shift();
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const r = this._projSz/2;
    let b = false;
    if (this.x-r<0)  { this.x=r;    this.vx= Math.abs(this.vx); b=true; }
    if (this.x+r>AW) { this.x=AW-r; this.vx=-Math.abs(this.vx); b=true; }
    if (this.y-r<0)  { this.y=r;    this.vy= Math.abs(this.vy); b=true; }
    if (this.y+r>AH) { this.y=AH-r; this.vy=-Math.abs(this.vy); b=true; }
    if (b) { this._bounces++; if (this._bounces > 24) this.alive=false; }
  }
}

// ── HOMING PROJECTILE (direto — vira em direção ao alvo) ───────
class HomingProj extends Proj {
  constructor(x, y, vx, vy, owner, target) {
    super(x, y, vx, vy, owner);
    this._target = target;
    this._angle  = Math.atan2(vy, vx);
    this._turn   = 5.5; // rad/s
  }
  update(dt) {
    if (this._target && this._target.alive) {
      const dx=this._target.x-this.x, dy=this._target.y-this.y;
      const desired=Math.atan2(dy,dx);
      let diff=desired-this._angle;
      while(diff> Math.PI) diff-=Math.PI*2;
      while(diff<-Math.PI) diff+=Math.PI*2;
      this._angle+=Math.sign(diff)*Math.min(Math.abs(diff),this._turn*dt);
      const spd=Math.hypot(this.vx,this.vy);
      this.vx=Math.cos(this._angle)*spd;
      this.vy=Math.sin(this._angle)*spd;
    }
    this.trail.push({x:this.x, y:this.y});
    if (this.trail.length>9) this.trail.shift();
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const r=this._projSz/2;
    if (this.x-r<0||this.x+r>AW||this.y-r<0||this.y+r>AH) this.alive=false;
  }
}

// ── BOUNCY HOMING PROJECTILE ───────────────────────────────────
class BouncyHomingProj extends BouncyProj {
  constructor(x, y, vx, vy, owner, target) {
    super(x, y, vx, vy, owner);
    this._target = target;
    this._angle  = Math.atan2(vy, vx);
    this._turn   = 5.5;
  }
  update(dt) {
    if (this._target && this._target.alive) {
      const dx=this._target.x-this.x, dy=this._target.y-this.y;
      const desired=Math.atan2(dy,dx);
      let diff=desired-this._angle;
      while(diff> Math.PI) diff-=Math.PI*2;
      while(diff<-Math.PI) diff+=Math.PI*2;
      this._angle+=Math.sign(diff)*Math.min(Math.abs(diff),this._turn*dt);
      const spd=Math.hypot(this.vx,this.vy);
      this.vx=Math.cos(this._angle)*spd;
      this.vy=Math.sin(this._angle)*spd;
    }
    super.update(dt);
  }
}

// ── TIGER PROJECTILE ───────────────────────────────────────────
// Depende de: TIGER_IMGS, imgOk
class TigerProj extends Proj {
  constructor(x,y,vx,vy,owner,symbol,dmg,healAmt) {
    super(x,y,vx,vy,owner);
    this.symbol=symbol; this.dmg=dmg; this.healAmt=healAmt||0;
    this._sz=26;
  }
  update(dt) {
    this.trail.push({x:this.x, y:this.y});
    if (this.trail.length>7) this.trail.shift();
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const r=this._sz/2;
    if (this.x-r<0||this.x+r>AW||this.y-r<0||this.y+r>AH) this.alive=false;
  }
  hits(c) {
    const r=c.sz/2+1.5+this._sz/2;
    return Math.abs(this.x-c.x)<r && Math.abs(this.y-c.y)<r;
  }
  draw(c) {
    if (!this.alive) return;
    const s=this._sz;
    const img=TIGER_IMGS[this.symbol];
    // Trail
    for (let i=0;i<this.trail.length;i++) {
      const t=i/this.trail.length;
      if (!imgOk(img)) continue;
      c.save(); c.globalAlpha=t*0.3;
      const ts=s*t*0.9;
      c.drawImage(img,this.trail[i].x-ts/2,this.trail[i].y-ts*0.65,ts,ts*1.3);
      c.restore();
    }
    if (imgOk(img)) {
      c.drawImage(img,this.x-s/2,this.y-s*0.65,s,s*1.3);
    } else {
      c.fillStyle='#FFD700'; c.fillRect(this.x-s/2,this.y-s/2,s,s);
    }
  }
}
