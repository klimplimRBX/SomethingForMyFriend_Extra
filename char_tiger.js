"use strict";

// ── FORTUNE TIGER CHARACTER ────────────────────────────────────
// Depende de: Character, TigerProj, TIGER_IMGS, TIGER_BURST_DLY, TIGER_PROJ_SPD,
//             DEAL_INTERVAL, DEAL_DURATION, DEAL_TOTAL_T, BAIANO_Z_WINDOW,
//             AW, SFX, imgOk, getWhite, lerp, clamp, canvas, DPR
const TIGER_CHARGE_T = 3.0; // Tiger charges a bit slower

class TigerCharacter extends Character {
  constructor(x,y,type) {
    super(x,y,type);
    this._slotState='idle'; // idle | dealing | revealed | cooldown
    this._slotTimer=0;
    this._dealTimer=0;
    this._cards=[];   // [{symbol, revealed, anim}]
    this._message=null; // {text, timer}
    this._other=null;
    this._tigerBurstQ=[]; // [{sym, dmg, healAmt}]
    this._tigerBurstT=0;
  }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); return; }
    this.hitFlash  = Math.max(0,this.hitFlash-dt);
    this.slowTimer = Math.max(0,this.slowTimer-dt);
    this.freezeTimer = Math.max(0,this.freezeTimer-dt);
    this._collideCD = Math.max(0,this._collideCD-dt);
    if (this._zHits > 0) {
      this._zGapTimer += dt;
      if (this._zGapTimer >= BAIANO_Z_WINDOW) { this._zHits=0; this._zGapTimer=0; }
    }
    if (this.freezeTimer > 0) { this._tickLabel(dt); this._tickMsg(dt); return; }
    this._move(dt, other);
    this._shoot(dt, other, projs);
    this._tickTigerBurst(dt, other, projs);
    this._tickLabel(dt);
    this._tickMsg(dt);
  }

  _shoot(dt, other, projs) {
    if (this._slotState==='idle') {
      const chargeT = this.hp < 200 ? 1.5 : TIGER_CHARGE_T;
      this.charge=Math.min(1,this.charge+dt/chargeT);
      if (this.charge>=1 && other && other.alive) {
        this.charge=0;
        this._other=other;
        this._startShuffle();
      }
    } else if (this._slotState==='dealing') {
      this._dealTimer+=dt;
      const total=DEAL_TOTAL_T;
      for (let i=0;i<this._cards.length;i++) {
        const startT=i*DEAL_INTERVAL;
        this._cards[i].anim=clamp((this._dealTimer-startT)/DEAL_DURATION,0,1);
      }
      if (this._dealTimer>=total) this._reveal();
    } else if (this._slotState==='revealed') {
      this._slotTimer-=dt;
      if (this._slotTimer<=0) this._resolve(projs);
    } else if (this._slotState==='cooldown') {
      this._slotTimer-=dt;
      if (this._slotTimer<=0) { this._slotState='idle'; this.charge=0; }
    }
  }

  _startShuffle() {
    this._slotState='dealing';
    this._dealTimer=0;
    this._cards=Array(5).fill(0).map(()=>({symbol:null,revealed:false,anim:0}));
    SFX.play('shuffle',1.0);
  }

  _rollSymbol() {
    const low=this.hp<201;
    const probs=low
      ? [['Wild',0.60],['GoldPot',0.20],['GoldCard',0.20],['Parchment',0],['Orange',0]]
      : [['Wild',0.05],['GoldPot',0.10],['GoldCard',0.20],['Parchment',0.25],['Orange',0.40]];
    let acc=0; const r=Math.random();
    for (const [sym,p] of probs) { acc+=p; if (r<acc) return sym; }
    return 'Orange';
  }

  _reveal() {
    this._slotState='revealed';
    this._slotTimer=0.5;
    for (const card of this._cards) { card.symbol=this._rollSymbol(); card.revealed=true; }
  }

  _resolve(projs) {
    const other=this._other;
    // Count each symbol
    const counts={};
    for (const card of this._cards) counts[card.symbol]=(counts[card.symbol]||0)+1;
    const pairs=Object.entries(counts).filter(([,n])=>n>=2);

    if (pairs.length===0) {
      // No pairs: house wins, Tiger suffers
      this.takeDamage(100);
      if (other && other.alive) other.heal(100);
      this._showMsg('É golpe!');
      this._slotState='cooldown';
      this._slotTimer=1.5;
    } else {
      // Determine message
      const hasWild    = pairs.some(([s])=>s==='Wild');
      const hasGoldPot = pairs.some(([s])=>s==='GoldPot');
      const hasGoldCard= pairs.some(([s])=>s==='GoldCard');
      const pool=['Coloca mais 20!','Só mais uma rodada!','Calma que o bug funciona!','Estratégia nova!'];
      if (hasWild)     this._showMsg('WILD!');
      else if (hasGoldPot)  this._showMsg('O TIGRE TÁ PAGANDO!');
      else if (hasGoldCard) this._showMsg('SORTE DOS DEUSES!');
      else this._showMsg(pool[Math.floor(Math.random()*pool.length)]);
      // Fire projectiles via burst queue — focused one after another
      if (other && other.alive) {
        for (const [sym,n] of pairs) {
          const dmgPer = sym==='Wild'     ? 200
                       : sym==='GoldPot'  ? 65
                       : sym==='GoldCard' ? 55
                       : sym==='Parchment'? 45
                       : 27; // Orange
          const healAmt = sym==='Orange' ? 27 : 0;
          const oneShot = sym==='Wild' || sym==='GoldPot';
          if (oneShot) {
            // Um único projétil com dano total
            this._tigerBurstQ.push({sym, dmgPer: dmgPer*n, healAmt});
          } else {
            for (let i=0;i<n;i++) this._tigerBurstQ.push({sym, dmgPer, healAmt});
          }
        }
        this._tigerBurstT=0;
      }
      this._slotState='idle'; this.charge=0;
    }
    this._cards=[];
  }

  _tickTigerBurst(dt, other, projs) {
    if (this._tigerBurstQ.length === 0) return;
    this._tigerBurstT -= dt;
    if (this._tigerBurstT > 0) return;
    const {sym, dmgPer, healAmt} = this._tigerBurstQ.shift();
    const tgt = this._other;
    if (tgt && tgt.alive) {
      // Predictive intercept: solve for where target will be when proj arrives
      const dx=tgt.x-this.x, dy=tgt.y-this.y;
      const tvx=tgt.vx*(tgt.slowTimer>0?0.25:1);
      const tvy=tgt.vy*(tgt.slowTimer>0?0.25:1);
      const spd = this.hp < 201 ? TIGER_PROJ_SPD * 2 : TIGER_PROJ_SPD;
      const a=tvx*tvx+tvy*tvy-spd*spd;
      const b=2*(dx*tvx+dy*tvy);
      const c2=dx*dx+dy*dy;
      let t=0;
      if (Math.abs(a)<0.001) {
        t = b!==0 ? -c2/b : 0;
      } else {
        const disc=b*b-4*a*c2;
        if (disc>=0) {
          const t1=(-b+Math.sqrt(disc))/(2*a);
          const t2=(-b-Math.sqrt(disc))/(2*a);
          const pos=[t1,t2].filter(v=>v>0);
          t = pos.length ? Math.min(...pos) : 0;
        }
      }
      t = Math.max(0, Math.min(t, 3)); // cap lookahead at 3s
      const aimX = tgt.x + tvx*t;
      const aimY = tgt.y + tvy*t;
      const a2 = Math.atan2(aimY-this.y, aimX-this.x);
      projs.push(new TigerProj(
        this.x, this.y,
        Math.cos(a2)*spd, Math.sin(a2)*spd,
        this, sym, dmgPer, healAmt
      ));
    }
    this._tigerBurstT = TIGER_BURST_DLY;
  }

  _showMsg(text) { this._message={text,timer:2.0}; }

  takeDamage(v) {
    super.takeDamage(v);
    if (!this.alive) {
      // Limpa toda a animação de cartas e voicelines ao morrer
      this._cards=[];
      this._message=null;
      this._tigerBurstQ=[];
      this._slotState='idle';
    }
  }

  _tickMsg(dt) {
    if (!this._message) return;
    this._message.timer-=dt;
    if (this._message.timer<=0) this._message=null;
  }

  draw(c) {
    if (this.alive) this._drawCards(c);

    if (this.alive) {
      const img=TIGER_IMGS.Tiger, sz=this.sz;
      if (imgOk(img)) {
        c.drawImage(img,this.x-sz/2,this.y-sz/2,sz,sz);
      } else {
        c.fillStyle=this.color; c.fillRect(this.x-sz/2,this.y-sz/2,sz,sz);
        c.strokeStyle='white'; c.lineWidth=3;
        c.strokeRect(this.x-sz/2,this.y-sz/2,sz,sz);
      }
      if (this.hitFlash>0) {
        const _wt=getWhite(img);
        if (_wt) c.drawImage(_wt,this.x-sz/2,this.y-sz/2,sz,sz);
      }
    }

    this._drawLabels(c);
    if (this.alive) this._drawMsg(c);
  }

  _drawCards(c) {
    if (this._cards.length===0) return;
    const n=5, cW=22, cH=30, gap=3;
    const totalW=n*cW+(n-1)*gap;
    const startX=this.x-totalW/2;
    const cY=this.y+this.sz/2+10;

    const isDealing  = this._slotState==='dealing';
    const isRevealed = this._slotState==='revealed';

    for (let i=0;i<n;i++) {
      const finalX=startX+i*(cW+gap);
      const finalY=cY;
      const card=this._cards[i];

      let cx, cy, scale=1;

      if (isDealing) {
        const t=card.anim||0;
        if (t<=0) continue; // carta ainda não começou a voar
        // ease-out cúbico
        const ease=1-Math.pow(1-t,3);
        cx=lerp(this.x, finalX+cW/2, ease);
        cy=lerp(this.y, finalY+cH/2, ease);
        scale=0.25+0.75*ease;
      } else {
        cx=finalX+cW/2;
        cy=finalY+cH/2;
      }

      const imgKey=(isRevealed && card.revealed)?card.symbol:'DefaultCard';
      const img=TIGER_IMGS[imgKey];

      c.save();
      c.translate(cx,cy);
      c.scale(scale,scale);

      // Sombra
      c.fillStyle='rgba(0,0,0,0.28)';
      c.fillRect(-cW/2+2,-cH/2+2,cW,cH);

      // Carta
      if (imgOk(img)) {
        c.drawImage(img,-cW/2,-cH/2,cW,cH);
      } else {
        c.fillStyle='#D4AF37'; c.fillRect(-cW/2,-cH/2,cW,cH);
        c.strokeStyle='#fff'; c.lineWidth=1;
        c.strokeRect(-cW/2,-cH/2,cW,cH);
      }
      c.restore();

      // Contorno dourado para pares quando revelado
      if (isRevealed && card.revealed) {
        const cnt=this._cards.filter(cd=>cd.symbol===card.symbol).length;
        if (cnt>=2) {
          c.strokeStyle='#FFD700'; c.lineWidth=2;
          c.strokeRect(finalX-1,finalY-1,cW+2,cH+2);
          c.save(); c.globalAlpha=0.25;
          c.fillStyle='#FFD700';
          c.fillRect(finalX-1,finalY-1,cW+2,cH+2);
          c.restore();
        }
      }
    }
  }

  _drawMsg(c) {
    if (!this._message) return;
    const t=this._message.timer;
    const fade=Math.min(1,t/0.4);
    const isGolpe=this._message.text==='É golpe!';
    const isWild =this._message.text==='WILD!';
    const isGods =this._message.text==='SORTE DOS DEUSES!';
    c.save(); c.globalAlpha=fade; c.textAlign='center';
    const fs=isWild?18:isGods?16:15;
    c.font=`bold ${fs}px Arial Black,sans-serif`;
    c.lineWidth=4; c.strokeStyle='rgba(0,0,0,0.9)';
    c.strokeText(this._message.text,this.x,this.y-this.sz/2-32);
    c.fillStyle=isGolpe?'#FF3B30':isWild?'#FF0':isGods?'#E8CFFF':'#FFD700';
    c.fillText(this._message.text,this.x,this.y-this.sz/2-32);
    c.restore();
  }

  drawHUD(c, camRef) {
    if (!this.alive) return;
    const cw=canvas.width/DPR, ch=canvas.height/DPR;
    const sx=cw/2+(this.x-camRef.x)*camRef.zoom;
    const sy=ch/2+(this.y-camRef.y)*camRef.zoom;
    const half=(this.sz/2)*camRef.zoom;
    this._drawHPScreen(c,sx,sy-half);
    // Charge bar: golden themed for Tiger, hidden during slot animation
    if (this._slotState==='idle') {
      this._drawTigerChargeBar(c,sx,sy+half,camRef.zoom);
    } else if (this._slotState!=='cooldown') {
      // Show animated slot indicator
      this._drawSlotIndicator(c,sx,sy+half,camRef.zoom);
    }
  }

  // Tiger: heal label no lado (fala em cima, cartas embaixo) — world space igual ao dmgLabel
  _tickLabel(dt) {
    if (this.dmgWin>0) {
      this.dmgWin-=dt;
      if (this.dmgLabel) { this.dmgLabel.x=this.x; this.dmgLabel.y=this.y+this.sz/2+22; }
    }
    if (this.dmgLabel && this.dmgWin<=0) {
      this.dmgLabel.y+=36*dt; this.dmgLabel.fade-=dt;
      if (this.dmgLabel.fade<=0) { this.dmgLabel=null; this.dmgStack=0; }
    }
    const side = this.x < AW/2 ? 1 : -1;
    const sideX = this.x + side*72;
    if (this.healWin>0) {
      this.healWin-=dt;
      if (this.healLabel) { this.healLabel.x=sideX; this.healLabel.y=this.y; }
    }
    if (this.healLabel && this.healWin<=0) {
      this.healLabel.x=sideX; // mantém no lado certo ao flutuar
      this.healLabel.y-=36*dt; this.healLabel.fade-=dt;
      if (this.healLabel.fade<=0) { this.healLabel=null; this.healStack=0; }
    }
  }

  heal(v) {
    if (!this.alive) return;
    this.hp=Math.min(this.maxHp,this.hp+v);
    this.healStack=(this.healStack||0)+v; this.healWin=STACK_WIN;
    const side = this.x < AW/2 ? 1 : -1;
    if (this.healLabel) { this.healLabel.val=this.healStack; }
    else { this.healLabel={val:this.healStack,x:this.x+side*72,y:this.y,fade:1.8}; }
  }

  _drawTigerChargeBar(c, cx, bottomY, zoom) {
    const bw=clamp(this.sz*zoom,28,90), bh=6, r=bh/2;
    const bx=cx-bw/2, by=bottomY+5;
    const danger = this.hp < 200;
    c.save();
    c.fillStyle='rgba(0,0,0,0.45)'; c.fillRect(bx,by,bw,bh);
    if (this.charge>0.01) {
      const g=c.createLinearGradient(bx,by,bx+bw,by);
      if (danger) {
        // Pulsa mais intenso no danger mode
        const flash=0.5+0.5*Math.sin(Date.now()/60);
        g.addColorStop(0,`rgba(232,81,10,${0.7+flash*0.3})`);
        g.addColorStop(1,`rgba(255,215,0,${0.7+flash*0.3})`);
      } else {
        g.addColorStop(0,'#E8510A'); g.addColorStop(1,'#FFD700');
      }
      c.fillStyle=g; c.fillRect(bx,by,bw*this.charge,bh);
    }
    const outlineColor = danger ? '#FF4500' : '#85C1E9';
    c.strokeStyle=outlineColor; c.lineWidth=1; c.strokeRect(bx,by,bw,bh);
    c.restore();
  }

  _drawSlotIndicator(c, cx, bottomY, zoom) {
    const bw=clamp(this.sz*zoom,28,90), bh=5;
    const bx=cx-bw/2, by=bottomY+5;
    c.fillStyle='rgba(0,0,0,0.4)'; c.fillRect(bx,by,bw,bh);
    // Animated shimmer
    const prog=this._slotState==='dealing'
      ? clamp(this._dealTimer/DEAL_TOTAL_T,0,1)
      : 1;
    const flash=0.5+0.5*Math.sin(Date.now()/80);
    c.fillStyle=`rgba(255,215,0,${0.4+flash*0.6})`;
    c.fillRect(bx,by,bw*prog,bh);
  }
}
