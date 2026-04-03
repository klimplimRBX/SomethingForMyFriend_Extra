"use strict";

// ── CHARACTER (base de todos os personagens) ───────────────────
// Depende de: CHAR_SZ, CHAR_SPD, CHARGE_T, PROJ_N, PROJ_SPD, BURST_DLY,
//             HIT_FLASH, SLOW_DUR, STACK_WIN, BAIANO_Z_WINDOW, BAIANO_Z_BURST_N,
//             AW, AH, SFX, Proj, canvas, DPR, clamp, rrect
class Character {
  constructor(x,y,type) {
    this.x=x; this.y=y; this.color=type.color; this.name=type.name; this.sz=CHAR_SZ;
    const a=Math.random()*Math.PI*2;
    this.vx=Math.cos(a)*CHAR_SPD; this.vy=Math.sin(a)*CHAR_SPD;
    this.hp=1000; this.maxHp=1000; this.charge=0; this.alive=true;
    this.hitFlash=0; this.slowTimer=0;
    this._freezeUntil=0;  // timestamp ms — Date.now() based, funciona em qualquer subclasse
    this._lastZHit=0; this._zHits=0;
    this.dmgStack=0; this.dmgWin=0; this.dmgLabel=null;
    this.healStack=0; this.healWin=0; this.healLabel=null;
    this.burstQ=[]; this.burstT=0;
    this._collideCD=0;
  }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); return; }
    this.hitFlash  = Math.max(0, this.hitFlash-dt);
    this.slowTimer = Math.max(0, this.slowTimer-dt);
    this.freezeTimer = Math.max(0, this.freezeTimer-dt);
    this._collideCD = Math.max(0, this._collideCD-dt);
    // Z-chain gap tracker — se passar muito tempo sem hit, reseta chain
    if (this._zHits > 0) {
      this._zGapTimer += dt;
      if (this._zGapTimer >= BAIANO_Z_WINDOW) { this._zHits=0; this._zGapTimer=0; }
    }
    if (this.freezeTimer > 0) { this._tickLabel(dt); return; } // congelado — só ticks de label
    this._move(dt, other);
    this._shoot(dt, other, projs);
    this._tickLabel(dt);
  }

  _move(dt, other) {
    const sp=this.slowTimer>0?0.25:1;
    this.x+=this.vx*sp*dt; this.y+=this.vy*sp*dt;
    const h=this.sz/2;
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

  _shoot(dt, other, projs) {
    this.charge=Math.min(1,this.charge+dt/CHARGE_T);
    if (this.charge>=1 && other && other.alive && this.burstQ.length===0) {
      this.charge=0;
      for (let i=0;i<PROJ_N;i++) this.burstQ.push(other);
      this.burstT=0;
    }
    if (this.burstQ.length>0) {
      this.burstT-=dt;
      if (this.burstT<=0) {
        const tgt=this.burstQ.shift();
        const a=Math.atan2(tgt.y-this.y,tgt.x-this.x);
        projs.push(new Proj(this.x,this.y,Math.cos(a)*PROJ_SPD,Math.sin(a)*PROJ_SPD,this));
        this.burstT=BURST_DLY;
      }
    }
  }

  takeDamage(v) {
    if (!this.alive) return;
    this.hp=Math.max(0,this.hp-v);
    this.hitFlash=HIT_FLASH; this.slowTimer=SLOW_DUR;
    this.dmgStack+=v; this.dmgWin=STACK_WIN;
    if (this.dmgLabel) { this.dmgLabel.val=this.dmgStack; }
    else { this.dmgLabel={val:this.dmgStack,x:this.x,y:this.y+this.sz/2+22,fade:1.8}; }
    if (this.hp<=0) { this.alive=false; SFX.play('death'); }
    else { SFX.play('hit',0.2); }
  }

  heal(v) {
    if (!this.alive) return;
    this.hp=Math.min(this.maxHp,this.hp+v);
    this.healStack=(this.healStack||0)+v; this.healWin=STACK_WIN;
    if (this.healLabel) { this.healLabel.val=this.healStack; }
    else { this.healLabel={val:this.healStack,x:this.x,y:this.y-this.sz/2-48,fade:1.8}; }
  }

  _tickLabel(dt) {
    if (this.dmgWin>0) {
      this.dmgWin-=dt;
      if (this.dmgLabel) { this.dmgLabel.x=this.x; this.dmgLabel.y=this.y+this.sz/2+22; }
    }
    if (this.dmgLabel && this.dmgWin<=0) {
      this.dmgLabel.y+=36*dt; this.dmgLabel.fade-=dt;
      if (this.dmgLabel.fade<=0) { this.dmgLabel=null; this.dmgStack=0; }
    }
    if (this.healWin>0) {
      this.healWin-=dt;
      if (this.healLabel) { this.healLabel.x=this.x; this.healLabel.y=this.y-this.sz/2-48; }
    }
    if (this.healLabel && this.healWin<=0) {
      this.healLabel.y-=36*dt; this.healLabel.fade-=dt;
      if (this.healLabel.fade<=0) { this.healLabel=null; this.healStack=0; }
    }
  }

  draw(c) {
    if (this.alive) {
      c.fillStyle=this.color;
      c.fillRect(this.x-this.sz/2,this.y-this.sz/2,this.sz,this.sz);
      if (this.hitFlash>0) {
        c.save();
        c.fillStyle='white';
        c.fillRect(this.x-this.sz/2,this.y-this.sz/2,this.sz,this.sz);
        c.restore();
      }
      if (this.freezeTimer>0) {
        c.save(); c.globalAlpha=0.45;
        c.fillStyle='#A0DFFF';
        c.fillRect(this.x-this.sz/2,this.y-this.sz/2,this.sz,this.sz);
        c.restore();
      }
      c.strokeStyle='white'; c.lineWidth=3;
      c.strokeRect(this.x-this.sz/2,this.y-this.sz/2,this.sz,this.sz);
    }
    this._drawLabels(c);
  }

  // Chamado quando um Z do Baiano acerta este personagem
  receiveZ(freezeDur) {
    this._zHits++;
    this._zGapTimer=0;
    if (this._zHits >= BAIANO_Z_BURST_N) {
      this.freezeTimer = freezeDur;
      this._zHits=0; this._zGapTimer=0;
    }
  }

  _drawLabels(c) {
    if (this.dmgLabel) {
      const {val,x,y,fade}=this.dmgLabel;
      c.save(); c.globalAlpha=clamp(fade/0.9,0,1); c.textAlign='center';
      c.font='bold 20px Arial Black,sans-serif'; c.lineWidth=4;
      c.strokeStyle='rgba(0,0,0,0.9)'; c.strokeText('-'+val,x,y);
      c.fillStyle='#FF3B30'; c.fillText('-'+val,x,y);
      c.restore();
    }
    if (this.healLabel) {
      const {val,x,y,fade}=this.healLabel;
      c.save(); c.globalAlpha=clamp(fade/0.9,0,1); c.textAlign='center';
      c.font='bold 20px Arial Black,sans-serif'; c.lineWidth=4;
      c.strokeStyle='rgba(0,0,0,0.9)'; c.strokeText('+'+val,x,y);
      c.fillStyle='#2ECC71'; c.fillText('+'+val,x,y);
      c.restore();
    }
  }

  drawHUD(c, camRef) {
    if (!this.alive) return;
    const cw=canvas.width/DPR, ch=canvas.height/DPR;
    const sx=cw/2+(this.x-camRef.x)*camRef.zoom;
    const sy=ch/2+(this.y-camRef.y)*camRef.zoom;
    const half=(this.sz/2)*camRef.zoom;
    this._drawHPScreen(c,sx,sy-half);
    this._drawChargeScreen(c,sx,sy+half,camRef.zoom);
  }

  _drawHPScreen(c, cx, topY) {
    const barW=72, barH=16, r=barH/2;
    const bx=cx-barW/2, by=topY-barH-6;
    const hpRatio=clamp(this.hp/this.maxHp,0,1);
    const barColor=hpRatio>=0.7?'#4CC444':hpRatio>=0.3?'#FFD700':'#FF3B30';
    c.save();
    c.fillStyle='rgba(0,0,0,0.35)'; rrect(c,bx+2,by+2,barW,barH,r); c.fill();
    c.fillStyle='#1a1a1a'; rrect(c,bx,by,barW,barH,r); c.fill();
    if (hpRatio>0) {
      c.save(); rrect(c,bx,by,barW,barH,r); c.clip();
      c.fillStyle=barColor; c.fillRect(bx,by,barW*hpRatio,barH); c.restore();
    }
    c.strokeStyle='#000'; c.lineWidth=2; rrect(c,bx,by,barW,barH,r); c.stroke();
    c.font='bold 22px Arial Black,sans-serif'; c.fillStyle=barColor; c.textAlign='center';
    c.lineWidth=3; c.strokeStyle='#000';
    c.strokeText('+',bx-11,by+barH/2+7); c.fillText('+',bx-11,by+barH/2+7);
    c.font='bold 10px Arial Black,sans-serif'; c.lineWidth=2.5; c.strokeStyle='#000';
    c.strokeText(Math.ceil(this.hp),cx,by+barH/2+4);
    c.fillStyle='white'; c.fillText(Math.ceil(this.hp),cx,by+barH/2+4);
    c.restore();
  }

  _drawChargeScreen(c, cx, bottomY, zoom) {
    // Normal characters don't show charge bar
  }
}
