// ── JEVIL — PERSONAGEM DE DEBUG (usa Finale.mp3) ───────────────
const JEVIL_HP         = 2500;
const JEVIL_SZ         = 68;
const JEVIL_CHARGE_T   = 1.4;
const JEVIL_PROJ_N     = 6;
const JEVIL_PROJ_SPD   = 420;
const JEVIL_PROJ_DMG   = 65;
const JEVIL_BURST_DLY  = 0.07;
const JEVIL_CHAOS_HP   = 700; // entra em CHAOS abaixo disso

class FinaleCharacter extends Character {
  constructor(x, y, type) {
    super(x, y, type);
    this.hp=JEVIL_HP; this.maxHp=JEVIL_HP; this.sz=JEVIL_SZ;
    this._angle=0; this._hue=270; this._chaos=false; this._chaosFlash=0;
  }
  _isChaos() { return this.hp>0 && this.hp<JEVIL_CHAOS_HP; }

  _shoot(dt, other, projs) {
    const chaos=this._isChaos();
    const chargeT=chaos ? JEVIL_CHARGE_T*0.5 : JEVIL_CHARGE_T;
    this.charge=Math.min(1, this.charge+dt/chargeT);
    if (this.charge>=1 && other && other.alive && this.burstQ.length===0) {
      this.charge=0;
      const n=chaos ? JEVIL_PROJ_N*2 : JEVIL_PROJ_N;
      for (let i=0;i<n;i++) this.burstQ.push(other);
      this.burstT=0;
    }
    if (this.burstQ.length>0) {
      this.burstT-=dt;
      if (this.burstT<=0) {
        const tgt=this.burstQ.shift();
        const baseA=Math.atan2(tgt.y-this.y, tgt.x-this.x);
        const total=chaos ? JEVIL_PROJ_N*2 : JEVIL_PROJ_N;
        const fired=total-this.burstQ.length-1;
        const spreadA=chaos ? fired*(Math.PI/9) : (Math.random()-0.5)*0.28;
        const a=baseA+spreadA;
        const spd=chaos ? JEVIL_PROJ_SPD*1.45 : JEVIL_PROJ_SPD;
        const p=new Proj(this.x,this.y,Math.cos(a)*spd,Math.sin(a)*spd,this);
        p._projSz=chaos?18:14; p._hitboxSz=chaos?18:14;
        p.dmg=chaos ? Math.round(JEVIL_PROJ_DMG*1.5) : JEVIL_PROJ_DMG;
        projs.push(p);
        this.burstT=JEVIL_BURST_DLY;
      }
    }
  }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); return; }
    this.hitFlash   = Math.max(0, this.hitFlash-dt);
    this.slowTimer  = Math.max(0, this.slowTimer-dt);
    this.freezeTimer= Math.max(0, this.freezeTimer-dt);
    this._collideCD = Math.max(0, this._collideCD-dt);
    this._angle    += dt*(this._isChaos() ? 4.5 : 1.8);
    this._hue       = (this._hue + dt*90) % 360;
    this._chaosFlash= Math.max(0, this._chaosFlash-dt);
    const wasChaos=this._chaos; this._chaos=this._isChaos();
    if (this._chaos && !wasChaos) this._chaosFlash=0.6;
    if (this.freezeTimer>0) { this._tickLabel(dt); return; }
    this._move(dt, other);
    this._shoot(dt, other, projs);
    this._tickLabel(dt);
  }

  draw(c) {
    if (!this.alive) { this._drawLabels(c); return; }
    const chaos=this._isChaos();
    const hue=this._hue;
    const sz=this.sz + (chaos ? 6*Math.sin(Date.now()/80) : 0);
    c.save(); c.translate(this.x, this.y); c.rotate(this._angle);
    // Glow
    c.shadowColor = chaos ? `hsl(${hue},100%,60%)` : '#9B59B6';
    c.shadowBlur  = chaos ? 24 : 10;
    // Corpo — losango
    c.beginPath();
    c.moveTo(0,-sz/2); c.lineTo(sz/2,0); c.lineTo(0,sz/2); c.lineTo(-sz/2,0);
    c.closePath();
    c.fillStyle   = chaos ? `hsl(${hue},85%,15%)` : '#1a0030';
    c.fill();
    c.strokeStyle = chaos ? `hsl(${hue},100%,65%)` : '#C39BD3';
    c.lineWidth=3; c.stroke();
    // Ícone central (não gira)
    c.rotate(-this._angle);
    c.shadowBlur=0;
    c.font=`bold ${Math.round(sz*0.38)}px Arial Black,sans-serif`;
    c.textAlign='center'; c.textBaseline='middle';
    c.fillStyle = chaos ? `hsl(${(hue+180)%360},100%,85%)` : '#E8D5F5';
    c.fillText('⚙', 0, 1);
    c.restore();
    // Hit flash
    if (this.hitFlash>0) {
      c.save(); c.translate(this.x,this.y); c.rotate(this._angle);
      c.fillStyle='rgba(255,255,255,0.85)';
      c.beginPath();
      c.moveTo(0,-sz/2); c.lineTo(sz/2,0); c.lineTo(0,sz/2); c.lineTo(-sz/2,0);
      c.closePath(); c.fill(); c.restore();
    }
    // Freeze
    if (this.freezeTimer>0) {
      c.save(); c.globalAlpha=0.4; c.fillStyle='#A0DFFF';
      c.fillRect(this.x-sz/2,this.y-sz/2,sz,sz); c.restore();
    }
    this._drawLabels(c);
  }

  _drawChargeScreen(c, cx, bottomY, zoom) {
    const barW=74*zoom, barH=7*zoom, bx=cx-barW/2, by=bottomY+4;
    c.save();
    c.fillStyle='rgba(0,0,0,0.5)'; c.fillRect(bx,by,barW,barH);
    const color=this._isChaos()?`hsl(${this._hue},100%,60%)`:'#C39BD3';
    c.fillStyle=color; c.fillRect(bx,by,barW*this.charge,barH);
    c.strokeStyle='rgba(255,255,255,0.25)'; c.lineWidth=1; c.strokeRect(bx,by,barW,barH);
    c.restore();
  }
}

