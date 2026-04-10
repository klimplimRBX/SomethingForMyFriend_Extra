"use strict";

// ── BAIANO PROJECTILE (Z) ──────────────────────────────────────
// Depende de: AW, AH
class BaianoProj {
  constructor(x, y, vx, vy, owner) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.owner=owner; this.alive=true;
    this.dmg=0;      // Zs não causam dano — só congelam
    this.healAmt=0;
    this._rot=0;
    this._trail=[];
  }
  update(dt) {
    this._trail.push({x:this.x, y:this.y});
    if (this._trail.length>6) this._trail.shift();
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this._rot+=dt*5;
    const r=17;
    if (this.x-r<0||this.x+r>AW||this.y-r<0||this.y+r>AH) this.alive=false;
  }
  hits(c) {
    const r=c.sz/2+1.5+17;
    return Math.abs(this.x-c.x)<r && Math.abs(this.y-c.y)<r;
  }
  draw(c) {
    if (!this.alive) return;
    // Trail
    for (let i=0;i<this._trail.length;i++) {
      const t=i/this._trail.length;
      c.save(); c.globalAlpha=t*0.3;
      c.fillStyle='#1A3A8A';
      c.font=`bold ${Math.round(22*t)}px Arial Black,sans-serif`;
      c.textAlign='center'; c.textBaseline='middle';
      c.fillText('Z',this._trail[i].x,this._trail[i].y);
      c.restore();
    }
    // Main Z
    c.save();
    c.translate(this.x,this.y);
    c.rotate(Math.sin(this._rot)*0.25); // wobble suave
    c.font='bold 26px Arial Black,sans-serif';
    c.strokeText('Z',0,0);
    c.fillStyle='#1A3DBF';
    c.fillText('Z',0,0);
    c.restore();
  }
}

// ── BAIANO CHARACTER ───────────────────────────────────────────
// Depende de: Character, BaianoProj, BAIANO_IMG,
//             BAIANO_SZ, BAIANO_IMG_W, BAIANO_IMG_H,
//             BAIANO_CHARGE_T, BAIANO_Z_BURST_N, BAIANO_Z_BURST_DLY,
//             BAIANO_Z_SPD, BAIANO_Z_WINDOW, BAIANO_FREEZE_DUR,
//             AW, SFX, imgOk, getWhite, clamp, rrect
class BaianoCharacter extends Character {
  constructor(x,y,type) {
    super(x,y,type);
    this.sz = BAIANO_SZ;
    this.hp=900; this.maxHp=900;
    this._burstQ = [];
    this._burstT = 0;
    this._snoring = false;
  }

  update(dt, other, projs) {
    if (!this.alive) {
      this._tickLabel(dt);
      if (this._snoring) { SFX.stopLoop('snoring'); this._snoring=false; }
      return;
    }
    // Inicia o loop de ronco assim que possível
    if (!this._snoring) { SFX.playLoop('snoring', 0.9); this._snoring=true; }

    this.hitFlash   = Math.max(0, this.hitFlash-dt);
    this.slowTimer  = Math.max(0, this.slowTimer-dt);
    this.freezeTimer= Math.max(0, this.freezeTimer-dt);
    this._collideCD = Math.max(0, this._collideCD-dt);
    if (this._zHits > 0) {
      this._zGapTimer += dt;
      if (this._zGapTimer >= BAIANO_Z_WINDOW) { this._zHits=0; this._zGapTimer=0; }
    }
    if (this.freezeTimer > 0) { this._tickLabel(dt); return; }
    this._move(dt, other);
    this._shootBaiano(dt, other, projs);
    this._tickBurst(dt, other, projs);
    this._tickLabel(dt);
  }

  _shootBaiano(dt, other, projs) {
    this.charge = Math.min(1, this.charge+dt/BAIANO_CHARGE_T);
    if (this.charge >= 1 && other && other.alive && this._burstQ.length===0) {
      this.charge=0;
      for (let i=0;i<BAIANO_Z_BURST_N;i++) this._burstQ.push(other);
      this._burstT=0;
    }
  }

  _tickBurst(dt, other, projs) {
    if (this._burstQ.length===0) return;
    this._burstT -= dt;
    if (this._burstT > 0) return;
    const tgt = this._burstQ.shift();
    if (tgt && tgt.alive) {
      // Mira preditiva
      const dx=tgt.x-this.x, dy=tgt.y-this.y;
      const tvx=tgt.vx*(tgt.slowTimer>0?0.25:1);
      const tvy=tgt.vy*(tgt.slowTimer>0?0.25:1);
      const spd=BAIANO_Z_SPD;
      const a=tvx*tvx+tvy*tvy-spd*spd;
      const b=2*(dx*tvx+dy*tvy);
      const c2=dx*dx+dy*dy;
      let t=0;
      if (Math.abs(a)<0.001) { t=b!==0?-c2/b:0; }
      else {
        const disc=b*b-4*a*c2;
        if (disc>=0) {
          const t1=(-b+Math.sqrt(disc))/(2*a);
          const t2=(-b-Math.sqrt(disc))/(2*a);
          const pos=[t1,t2].filter(v=>v>0);
          t=pos.length?Math.min(...pos):0;
        }
      }
      t=Math.max(0,Math.min(t,2));
      const aimX=tgt.x+tvx*t, aimY=tgt.y+tvy*t;
      // Imprecisão: desvia o ângulo em até ±8°, aleatório por Z
      const baseAng=Math.atan2(aimY-this.y, aimX-this.x);
      const spread=(Math.random()-0.5)*0.279; // ±0.1396 rad ≈ ±8°
      const ang=baseAng+spread;
      projs.push(new BaianoProj(this.x, this.y, Math.cos(ang)*spd, Math.sin(ang)*spd, this));
    }
    this._burstT = BAIANO_Z_BURST_DLY;
  }

  _drawHPScreen(c, cx, topY) {
    const barW=72, barH=16, r=barH/2;
    const bx=cx-barW/2, by=topY-barH-6;
    const hpRatio=clamp(this.hp/this.maxHp,0,1);
    const barColor=this.hp>600?'#4CC444':this.hp>300?'#E6C020':'#E82020';
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

  draw(c) {
    if (this.alive) {
      const w=BAIANO_IMG_W, h=BAIANO_IMG_H;
      c.save();
      c.translate(this.x, this.y);
      if (imgOk(BAIANO_IMG)) {
        c.drawImage(BAIANO_IMG, -w/2, -h/2, w, h);
      } else {
        c.fillStyle=this.color;
        c.fillRect(-this.sz/2,-this.sz/2,this.sz,this.sz);
        c.strokeStyle='white'; c.lineWidth=3;
        c.strokeRect(-this.sz/2,-this.sz/2,this.sz,this.sz);
      }
      if (this.hitFlash>0) {
        const _wb=getWhite(BAIANO_IMG);
        if (_wb) c.drawImage(_wb,-w/2,-h/2,w,h);
      }
      if (this.freezeTimer>0) {
        c.globalAlpha=0.40;
        c.fillStyle='#A0DFFF';
        c.fillRect(-w/2,-h/2,w,h);
      }
      c.restore();
    }
    this._drawLabels(c);
  }
}
