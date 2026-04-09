"use strict";

// ── NEYMAR PROJECTILE ──────────────────────────────────────────
// Depende de: NEYMAR_PROJ_DMG, NEYMAR_PROJ_SZ, NEYMAR_IMGS, AW, AH, imgOk
class NeymarProj {
  constructor(x,y,vx,vy,owner) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.owner=owner; this.alive=true; this.trail=[];
    this.dmg=NEYMAR_PROJ_DMG; this.healAmt=0;
    this._rot=0;
  }
  update(dt) {
    this.trail.push({x:this.x,y:this.y});
    if (this.trail.length>8) this.trail.shift();
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this._rot+=dt*8;
    const r=NEYMAR_PROJ_SZ/2;
    if (this.x-r<0||this.x+r>AW||this.y-r<0||this.y+r>AH) this.alive=false;
  }
  hits(c) {
    const r=c.sz/2+1.5+NEYMAR_PROJ_SZ/2;
    return Math.abs(this.x-c.x)<r && Math.abs(this.y-c.y)<r;
  }
  draw(c) {
    if (!this.alive) return;
    const s=NEYMAR_PROJ_SZ;
    const img=NEYMAR_IMGS['BolaProp'];
    for (let i=0;i<this.trail.length;i++) {
      const t=i/this.trail.length;
      c.save(); c.globalAlpha=t*0.35;
      c.fillStyle='white';
      c.beginPath(); c.arc(this.trail[i].x,this.trail[i].y,s*t*0.4,0,Math.PI*2); c.fill();
      c.restore();
    }
    c.save();
    c.translate(this.x,this.y); c.rotate(this._rot);
    if (imgOk(img)) {
      c.drawImage(img,-s/2,-s/2,s,s);
    } else {
      c.fillStyle='white'; c.beginPath(); c.arc(0,0,s/2,0,Math.PI*2); c.fill();
      c.strokeStyle='#000'; c.lineWidth=1.5; c.stroke();
    }
    c.restore();
  }
}

// ── NEYMAR CHARACTER ───────────────────────────────────────────
// Depende de: Character, NeymarProj, NEYMAR_IMGS,
//             NEYMAR_SZ, NEYMAR_SPD, NEYMAR_CHARGE_T, NEYMAR_PROJ_SPD,
//             NEYMAR_HIT_FLASH, NEYMAR_DRIBBLE_CD, NEYMAR_DRIBBLE_DUR,
//             NEYMAR_DRIBBLE_SPD, BAIANO_Z_WINDOW, AW, AH, SLOW_DUR,
//             STACK_WIN, CHAR_SPD, SFX, imgOk
class NeymarCharacter extends Character {
  constructor(x,y,type) {
    super(x,y,type);
    this.sz = NEYMAR_SZ;
    this.vx = (this.vx/CHAR_SPD)*NEYMAR_SPD;
    this.vy = (this.vy/CHAR_SPD)*NEYMAR_SPD;
    this._dribbleCD  = NEYMAR_DRIBBLE_CD * Math.random();
    this._dribbling  = false;
    this._dribbleT   = 0;
    this._hurtTimer  = 0;
  }

  takeDamage(v) {
    if (!this.alive) return;
    const wasHurt = this._hurtTimer > 0;
    this.hp = Math.max(0, this.hp-v);
    this.hitFlash  = NEYMAR_HIT_FLASH;
    this._hurtTimer = NEYMAR_HIT_FLASH;
    this.slowTimer = SLOW_DUR;
    this.dmgStack += v; this.dmgWin = STACK_WIN;
    if (this.dmgLabel) { this.dmgLabel.val = this.dmgStack; }
    else { this.dmgLabel = {val:this.dmgStack, x:this.x, y:this.y+this.sz/2+22, fade:1.8}; }
    if (this.hp <= 0) { this.alive=false; SFX.play('death'); }
    else {
      SFX.play('hit', 0.2);
      if (!wasHurt) SFX.play('ankleBreak', 1.0);
    }
  }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); return; }
    this.hitFlash   = Math.max(0, this.hitFlash-dt);
    this.slowTimer  = Math.max(0, this.slowTimer-dt);
    this.freezeTimer= Math.max(0, this.freezeTimer-dt);
    this._collideCD = Math.max(0, this._collideCD-dt);
    this._hurtTimer = Math.max(0, this._hurtTimer-dt);
    if (this._zHits > 0) {
      this._zGapTimer += dt;
      if (this._zGapTimer >= BAIANO_Z_WINDOW) { this._zHits=0; this._zGapTimer=0; }
    }
    // Congelado (freeze ou hurt) — só ticks de label
    if (this.freezeTimer > 0 || this._hurtTimer > 0) { this._tickLabel(dt); return; }
    this._tickDribble(dt, projs);
    this._move(dt, other);
    this._shootNeymar(dt, other, projs);
    this._tickLabel(dt);
  }

  _tickDribble(dt, projs) {
    if (this._dribbling) {
      this._dribbleT -= dt;

      // Procura o projétil mais próximo
      let closest=null, bestD=Infinity;
      for (const p of projs) {
        if (!p.alive || p.owner===this) continue;
        const d=Math.hypot(p.x-this.x, p.y-this.y);
        if (d<bestD) { bestD=d; closest=p; }
      }

      if (closest && bestD < 200) {
        // Direção de fuga perpendicular à trajetória do proj
        const awayX=this.x-closest.x, awayY=this.y-closest.y;
        const len=Math.hypot(awayX,awayY)||1;
        const fx=awayX/len, fy=awayY/len;
        // Verifica se fugindo nessa direção bate na parede
        const nx=this.x+fx*60, ny=this.y+fy*60;
        const h=this.sz/2;
        const blocked=nx-h<0||nx+h>AW||ny-h<0||ny+h>AH;
        if (!blocked) {
          this.vx=fx*NEYMAR_DRIBBLE_SPD; this.vy=fy*NEYMAR_DRIBBLE_SPD;
        }
        // se bloqueado, fica parado esperando o proj passar
        else {
          this.vx=0; this.vy=0;
        }
      }

      if (this._dribbleT <= 0) {
        this._dribbling = false;
        const a = Math.random()*Math.PI*2;
        this.vx = Math.cos(a)*NEYMAR_SPD;
        this.vy = Math.sin(a)*NEYMAR_SPD;
      }
    } else {
      this._dribbleCD -= dt;
      if (this._dribbleCD <= 0) {
        this._dribbleCD = NEYMAR_DRIBBLE_CD + Math.random()*1.5;
        this._dribbling = true;
        this._dribbleT  = NEYMAR_DRIBBLE_DUR;
        const a = Math.random()*Math.PI*2;
        this.vx = Math.cos(a)*NEYMAR_DRIBBLE_SPD;
        this.vy = Math.sin(a)*NEYMAR_DRIBBLE_SPD;
      }
    }
  }

  _move(dt, other) {
    const sp = (this.slowTimer>0 && !this._dribbling) ? 0.25 : 1;
    this.x += this.vx*sp*dt; this.y += this.vy*sp*dt;
    const h = this.sz/2;
    if (this.x-h<0)  { this.x=h;    this.vx= Math.abs(this.vx); SFX.play('collide',0.8); }
    if (this.x+h>AW) { this.x=AW-h; this.vx=-Math.abs(this.vx); SFX.play('collide',0.8); }
    if (this.y-h<0)  { this.y=h;    this.vy= Math.abs(this.vy); SFX.play('collide',0.8); }
    if (this.y+h>AH) { this.y=AH-h; this.vy=-Math.abs(this.vy); SFX.play('collide',0.8); }

    if (other && other.alive && !other.noCollide && this._collideCD<=0) {
      const dx=other.x-this.x, dy=other.y-this.y;
      const d=Math.hypot(dx,dy), minD=(this.sz+other.sz)/2;
      if (d<minD && d>0.01) {
        const nx=dx/d, ny=dy/d, ov=(minD-d)*0.5;
        this.x-=nx*ov; this.y-=ny*ov;
        other.x+=nx*ov; other.y+=ny*ov;
        SFX.play('collide',0.8);
        this._collideCD=0.12; other._collideCD=0.12;
        if (!this._dribbling) {
          const d1=this.vx*nx+this.vy*ny;
          if (d1>0) { this.vx-=2*d1*nx; this.vy-=2*d1*ny; }
          const ns1=Math.hypot(this.vx,this.vy);
          if (ns1>0.01) { this.vx=this.vx/ns1*NEYMAR_SPD; this.vy=this.vy/ns1*NEYMAR_SPD; }
        }
        const spd2=Math.hypot(other.vx,other.vy);
        const d2=other.vx*(-nx)+other.vy*(-ny);
        if (d2>0) { other.vx-=2*d2*(-nx); other.vy-=2*d2*(-ny); }
        const ns2=Math.hypot(other.vx,other.vy);
        if (ns2>0.01) { other.vx=other.vx/ns2*spd2; other.vy=other.vy/ns2*spd2; }
      }
    }
  }

  _shootNeymar(dt, other, projs) {
    this.charge = Math.min(1, this.charge+dt/NEYMAR_CHARGE_T);
    if (this.charge>=1 && other && other.alive) {
      this.charge=0;
      SFX.play('kick', 1.0);
      // Tiro teleguiado: prevê posição futura do alvo
      const dx=other.x-this.x, dy=other.y-this.y;
      const tvx=other.vx*(other.slowTimer>0?0.25:1);
      const tvy=other.vy*(other.slowTimer>0?0.25:1);
      const spd=NEYMAR_PROJ_SPD;
      const a2c=tvx*tvx+tvy*tvy-spd*spd;
      const b2c=2*(dx*tvx+dy*tvy);
      const c2c=dx*dx+dy*dy;
      let t=0;
      if (Math.abs(a2c)<0.001) {
        t = b2c!==0 ? -c2c/b2c : 0;
      } else {
        const disc=b2c*b2c-4*a2c*c2c;
        if (disc>=0) {
          const t1=(-b2c+Math.sqrt(disc))/(2*a2c);
          const t2=(-b2c-Math.sqrt(disc))/(2*a2c);
          const pos=[t1,t2].filter(v=>v>0);
          t = pos.length ? Math.min(...pos) : 0;
        }
      }
      t = Math.max(0, Math.min(t, 2));
      const aimX=other.x+tvx*t, aimY=other.y+tvy*t;
      const ang=Math.atan2(aimY-this.y, aimX-this.x);
      projs.push(new NeymarProj(this.x, this.y, Math.cos(ang)*spd, Math.sin(ang)*spd, this));
    }
  }

  draw(c) {
    if (this.alive) {
      const sz=this.sz;
      const hurt=this._hurtTimer>0;
      const img=NEYMAR_IMGS[hurt?'Neymar2':'Neymar'];
      c.save();
      c.translate(this.x, this.y);
      if (imgOk(img)) {
        c.drawImage(img,-sz/2,-sz/2,sz,sz);
      } else {
        c.fillStyle=this.color;
        c.fillRect(-sz/2,-sz/2,sz,sz);
        c.strokeStyle='white'; c.lineWidth=3;
        c.strokeRect(-sz/2,-sz/2,sz,sz);
      }
      c.restore();
    }
    this._drawLabels(c);
  }
}
