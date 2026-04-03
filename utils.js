"use strict";

// ── CANVAS FIT ─────────────────────────────────────────────────
// Depende de: canvas, DPR (globais do index.html)
function fit() {
  canvas.width  = Math.round(window.innerWidth  * DPR);
  canvas.height = Math.round(window.innerHeight * DPR);
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
}
fit();
window.addEventListener('resize', fit);

// ── UTILS ──────────────────────────────────────────────────────
const lerp  = (a,b,t) => a+(b-a)*t;
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

function rrect(c, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r);
  c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r);
  c.arcTo(x,y,x+w,y,r); c.closePath();
}

function oText(c, text, x, y, fill, stroke, sw) {
  c.lineWidth = sw||4; c.strokeStyle = stroke||'#000';
  c.strokeText(text,x,y); c.fillStyle = fill||'white'; c.fillText(text,x,y);
}

// ── CAMERA ─────────────────────────────────────────────────────
// Depende de: canvas, DPR, AW, AH, BORDER, CHAR_SZ, lerp, clamp
const cam = {
  x:AW/2, y:AH/2, zoom:1, _tx:AW/2, _ty:AH/2, _tz:1,
  _shakeAmt:0, _shakeX:0, _shakeY:0,
  _bz() {
    return Math.min(
      (canvas.width/DPR)*0.82/(AW+BORDER*2),
      (canvas.height/DPR)*0.76/(AH+BORDER*2)
    );
  },
  reset() {
    const z=this._bz();
    this.x=AW/2; this.y=AH/2; this.zoom=z;
    this._tx=AW/2; this._ty=AH/2; this._tz=z;
    this._shakeAmt=0; this._shakeX=0; this._shakeY=0;
  },
  update(dt, chars) {
    const alive=chars.filter(c=>c.alive);
    const cw=canvas.width/DPR, ch=canvas.height/DPR;
    if (alive.length===2) {
      this._tx=(alive[0].x+alive[1].x)/2; this._ty=(alive[0].y+alive[1].y)/2;
      const pad=CHAR_SZ*4;
      const sx=Math.abs(alive[0].x-alive[1].x)+pad;
      const sy=Math.abs(alive[0].y-alive[1].y)+pad;
      const targetZ=Math.min(cw*0.88/sx, ch*0.88/sy);
      this._tz=clamp(targetZ, this._bz()*0.92, this._bz()*1.5);
    } else if (alive.length===1) {
      this._tx=alive[0].x; this._ty=alive[0].y;
      this._tz=clamp(Math.min(cw*0.45/200, ch*0.45/200), 0.9, 2.4);
    }
    const s=1-Math.exp(-4*dt);
    this.x=lerp(this.x,this._tx,s); this.y=lerp(this.y,this._ty,s); this.zoom=lerp(this.zoom,this._tz,s);
    // Shake — suavizado com lerp para evitar jitter extremo
    const targetSX = this._shakeAmt > 0 ? (Math.random()*2-1)*this._shakeAmt : 0;
    const targetSY = this._shakeAmt > 0 ? (Math.random()*2-1)*this._shakeAmt : 0;
    this._shakeX = lerp(this._shakeX, targetSX, 0.45);
    this._shakeY = lerp(this._shakeY, targetSY, 0.45);
  },
  apply(c) {
    const cw=canvas.width/DPR, ch=canvas.height/DPR;
    c.scale(DPR,DPR); c.translate(cw/2,ch/2);
    c.scale(this.zoom,this.zoom); c.translate(-this.x, -this.y);
  }
};
