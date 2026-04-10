// ── LADRÃO PROJECTILE (teleguiado → inimigo) ───────────────────
class LadraoProjeto extends Proj {
  constructor(x, y, vx, vy, owner, target) {
    super(x, y, vx, vy, owner);
    this._target = target;
    this._projSz = RF_PROJ_SZ;
    this._hitboxSz = RF_PROJ_SZ;
    this.dmg = RF_PROJ_DMG;
    this._angle = Math.atan2(vy, vx);
  }
  update(dt) {
    // Se foi refletido pelo cachorro, troca o alvo para o novo dono ser seguido
    if (this._homingTarget) {
      this._target = this._homingTarget;
      this._homingTarget = null;
    }
    if (this._target && this._target.alive) {
      const dx=this._target.x-this.x, dy=this._target.y-this.y;
      const desired=Math.atan2(dy,dx);
      let diff=desired-this._angle;
      while (diff> Math.PI) diff-=Math.PI*2;
      while (diff<-Math.PI) diff+=Math.PI*2;
      this._angle+=Math.min(Math.abs(diff),RF_TURN_SPD*dt)*Math.sign(diff);
      this.vx=Math.cos(this._angle)*RF_PROJ_SPD;
      this.vy=Math.sin(this._angle)*RF_PROJ_SPD;
    }
    this.trail.push({x:this.x,y:this.y});
    if (this.trail.length>9) this.trail.shift();
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
      const t=i/this.trail.length, ts=this._projSz*t*0.7;
      c.save(); c.globalAlpha=t*0.38;
      c.fillStyle='#27AE60';
      c.fillRect(this.trail[i].x-ts/2,this.trail[i].y-ts/2,ts,ts);
      c.restore();
    }
    const s=this._projSz;
    c.save(); c.translate(this.x,this.y);
    if (imgOk(RF_IMGS.Ladrao)) {
      c.drawImage(RF_IMGS.Ladrao,-s/2,-s/2,s,s);
    } else {
      c.fillStyle='#27AE60'; c.fillRect(-s/2,-s/2,s,s);
      c.strokeStyle='white'; c.lineWidth=2; c.strokeRect(-s/2,-s/2,s,s);
    }
    c.restore();
  }
}

// ── MONEY PROJECTILE (volta teleguiado → dono para curar) ───────
class MoneyProjeto {
  constructor(x, y, owner) {
    this.x=x; this.y=y; this.owner=owner; this.alive=true;
    this.trail=[];
    const dx=owner.x-x, dy=owner.y-y;
    this._angle=Math.atan2(dy,dx);
    this.vx=Math.cos(this._angle)*RF_PROJ_SPD;
    this.vy=Math.sin(this._angle)*RF_PROJ_SPD;
  }
  update(dt) {
    if (this.owner && this.owner.alive) {
      const dx=this.owner.x-this.x, dy=this.owner.y-this.y;
      const desired=Math.atan2(dy,dx);
      let diff=desired-this._angle;
      while (diff> Math.PI) diff-=Math.PI*2;
      while (diff<-Math.PI) diff+=Math.PI*2;
      this._angle+=Math.min(Math.abs(diff),RF_TURN_SPD*dt)*Math.sign(diff);
      this.vx=Math.cos(this._angle)*RF_PROJ_SPD;
      this.vy=Math.sin(this._angle)*RF_PROJ_SPD;
    }
    this.trail.push({x:this.x,y:this.y});
    if (this.trail.length>7) this.trail.shift();
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const r=RF_MONEY_SZ/2;
    if (this.x-r<0||this.x+r>AW||this.y-r<0||this.y+r>AH) this.alive=false;
  }
  hitsOwner() {
    if (!this.owner) return false;
    const r=this.owner.sz/2+RF_MONEY_SZ/2;
    return Math.abs(this.x-this.owner.x)<r && Math.abs(this.y-this.owner.y)<r;
  }
  draw(c) {
    if (!this.alive) return;
    for (let i=0;i<this.trail.length;i++) {
      const t=i/this.trail.length, ts=RF_MONEY_SZ*t*0.7;
      c.save(); c.globalAlpha=t*0.4;
      c.fillStyle='#F1C40F';
      c.fillRect(this.trail[i].x-ts/2,this.trail[i].y-ts/2,ts,ts);
      c.restore();
    }
    const s=RF_MONEY_SZ;
    c.save(); c.translate(this.x,this.y);
    if (imgOk(RF_IMGS.Money)) {
      c.drawImage(RF_IMGS.Money,-s/2,-s/2,s,s);
    } else {
      c.fillStyle='#F1C40F'; c.beginPath(); c.arc(0,0,s/2,0,Math.PI*2); c.fill();
      c.strokeStyle='#B7950B'; c.lineWidth=2; c.stroke();
    }
    c.restore();
  }
}

// ── RECEITA FEDERAL CHARACTER ───────────────────────────────────
// Ciclo: charging → atira ladrão (in_flight) → ladrão acerta →
//        dinheiro voa de volta (collecting) → dinheiro coletado →
//        delay 0.5s (cooldown) → charging de novo
class ReceitaFederalCharacter extends Character {
  constructor(x, y, type) {
    super(x, y, type);
    this.hp=1000; this.maxHp=1000; this.sz=RF_SZ;
    this._moneyProjs=[];
    this._rfState='charging'; // 'charging' | 'in_flight' | 'collecting' | 'cooldown'
    this._rfDelay=0;
    this._activeLadrão=null;
  }
  _shoot(dt, other, projs) {
    if (this._rfState !== 'charging') return;
    if (other && other.alive) {
      const dx=other.x-this.x, dy=other.y-this.y;
      const a=Math.atan2(dy,dx);
      const p=new LadraoProjeto(this.x,this.y,Math.cos(a)*RF_PROJ_SPD,Math.sin(a)*RF_PROJ_SPD,this,other);
      projs.push(p);
      this._activeLadrão=p;
      this._rfState='in_flight';
    }
  }
  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); this._tickMoney(dt); return; }
    this.hitFlash=Math.max(0,this.hitFlash-dt);
    this.slowTimer=Math.max(0,this.slowTimer-dt);
    this.freezeTimer=Math.max(0,this.freezeTimer-dt);
    this._collideCD=Math.max(0,this._collideCD-dt);
    if (this.freezeTimer > 0) { this._tickLabel(dt); this._tickMoney(dt); return; }
    // Ladrão saiu de campo sem acertar → reinicia ciclo
    if (this._rfState==='in_flight' && this._activeLadrão && !this._activeLadrão.alive) {
      this._activeLadrão=null;
      this._rfState='charging';
    }
    // Cooldown pós-coleta
    if (this._rfState==='cooldown') {
      this._rfDelay=Math.max(0,this._rfDelay-dt);
      if (this._rfDelay<=0) this._rfState='charging';
    }
    // Dinheiro coletado (ou saiu de campo) → inicia cooldown
    if (this._rfState==='collecting' && this._moneyProjs.length===0) {
      this._rfState='cooldown';
      this._rfDelay=RF_COLLECT_DELAY;
    }
    this._move(dt,other);
    this._shoot(dt,other,projs);
    this._tickMoney(dt);
    this._tickLabel(dt);
  }
  _tickMoney(dt) {
    for (const mp of this._moneyProjs) {
      mp.update(dt);
      if (mp.alive && mp.hitsOwner()) {
        if (this.alive) this.heal(RF_PROJ_HEAL);
        mp.alive=false;
      }
    }
    this._moneyProjs=this._moneyProjs.filter(mp=>mp.alive);
  }
  spawnMoney(x, y) {
    this._moneyProjs.push(new MoneyProjeto(x,y,this));
    this._activeLadrão=null;
    this._rfState='collecting';
    SFX.playFrom('money', 0.6, 1.0);
  }
  _drawChargeScreen(c, cx, bottomY, zoom) {
    if (this._rfState==='charging') return;
    const barW=64*zoom, barH=6*zoom, bx=cx-barW/2, by=bottomY+4;
    c.save();
    c.fillStyle='rgba(0,0,0,0.45)'; c.fillRect(bx,by,barW,barH);
    if (this._rfState==='in_flight') {
      const flash=0.5+0.5*Math.sin(Date.now()/120);
      c.fillStyle=`rgba(41,128,185,${flash})`; c.fillRect(bx,by,barW,barH);
    } else if (this._rfState==='collecting') {
      const flash=0.5+0.5*Math.sin(Date.now()/100);
      c.fillStyle=`rgba(241,196,15,${flash})`; c.fillRect(bx,by,barW,barH);
    } else if (this._rfState==='cooldown' && this._rfDelay>0) {
      const prog=1-(this._rfDelay/RF_COLLECT_DELAY);
      c.fillStyle='#C0392B'; c.fillRect(bx,by,barW*prog,barH);
    }
    c.strokeStyle='#85C1E9'; c.lineWidth=1; c.strokeRect(bx,by,barW,barH);
    c.restore();
  }
  draw(c) {
    for (const mp of this._moneyProjs) mp.draw(c);
    if (this.alive) {
      const sz=this.sz;
      if (imgOk(RF_IMGS.ReceitaFederal)) {
        c.drawImage(RF_IMGS.ReceitaFederal,this.x-sz/2,this.y-sz/2,sz,sz);
        if (this.hitFlash>0) {
          const wt=getWhite(RF_IMGS.ReceitaFederal);
          if (wt) c.drawImage(wt,this.x-sz/2,this.y-sz/2,sz,sz);
        }
      } else {
        c.fillStyle='#2471A3'; c.fillRect(this.x-sz/2,this.y-sz/2,sz,sz);
        c.strokeStyle='white'; c.lineWidth=3; c.strokeRect(this.x-sz/2,this.y-sz/2,sz,sz);
        c.fillStyle='white'; c.font='bold 9px Arial'; c.textAlign='center';
        c.fillText('RF',this.x,this.y+4);
      }
      if (this.freezeTimer>0) {
        c.save(); c.globalAlpha=0.40; c.fillStyle='#A0DFFF';
        c.fillRect(this.x-sz/2,this.y-sz/2,sz,sz); c.restore();
      }
    }
    this._drawLabels(c);
  }
}
