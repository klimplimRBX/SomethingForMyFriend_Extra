// ── GAME ───────────────────────────────────────────────────────
// ENGINEER PATCH: com torretas infinitas pode haver várias sentries vivas ao
// mesmo tempo — escolhe a mais próxima do personagem pra ser o alvo forçado.
function _nearestSentry(list, x, y) {
  let best = null, bestD = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

// ── TINT DE VENENO (genérico) ──────────────────────────────────────
// Em vez de pintar um quadrado sólido por cima do sprite (o que também
// pintava as partes transparentes da imagem), redesenha o personagem
// num canvas auxiliar transparente e usa 'source-atop' pra tingir só os
// pixels que já são opacos ali — preserva a transparência e funciona pra
// qualquer tamanho de sprite (inclusive os escalados, tipo o Dark Ninja).
const _POISON_TINT_SZ = 240;
const _poisonTintCanvas = document.createElement('canvas');
_poisonTintCanvas.width = _POISON_TINT_SZ;
_poisonTintCanvas.height = _POISON_TINT_SZ;
const _poisonTintCtx = _poisonTintCanvas.getContext('2d');

function _drawPoisonTint(ctx, c) {
  const half = _POISON_TINT_SZ / 2;
  _poisonTintCtx.clearRect(0, 0, _POISON_TINT_SZ, _POISON_TINT_SZ);

  // Se o personagem já morreu envenenado, ainda assim capturamos a silhueta
  // do sprite (draw() normalmente não desenha nada quando !alive) só pra
  // gerar a máscara — nada de estado do jogo é alterado por isso.
  const _wasAlive = c.alive;
  c.alive = true;
  c._maskMode = true;
  _poisonTintCtx.save();
  _poisonTintCtx.translate(half - c.x, half - c.y);
  c.draw(_poisonTintCtx);
  _poisonTintCtx.restore();
  c._maskMode = false;
  c.alive = _wasAlive;

  _poisonTintCtx.globalCompositeOperation = 'source-atop';
  _poisonTintCtx.globalAlpha = 0.5 * clamp(c._poisonTintT / TXD_TINT_DUR, 0, 1);
  _poisonTintCtx.fillStyle = '#0B6E1F';
  _poisonTintCtx.fillRect(0, 0, _POISON_TINT_SZ, _POISON_TINT_SZ);
  _poisonTintCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(_poisonTintCanvas, c.x - half, c.y - half);
}

// ── TINT DE STUN (genérico) ────────────────────────────────────────
// Mesma técnica do tint de veneno acima: em vez do cubo azul sólido por
// cima (que também pintava as partes transparentes do sprite), redesenha
// o personagem num canvas auxiliar e usa 'source-atop' pra tingir de azul
// só os pixels que já são opacos ali. Dark Ninja usa um azul mais escuro.
const _STUN_TINT_SZ = 240;
const _stunTintCanvas = document.createElement('canvas');
_stunTintCanvas.width = _STUN_TINT_SZ;
_stunTintCanvas.height = _STUN_TINT_SZ;
const _stunTintCtx = _stunTintCanvas.getContext('2d');

function _drawStunTint(ctx, c) {
  const half = _STUN_TINT_SZ / 2;
  _stunTintCtx.clearRect(0, 0, _STUN_TINT_SZ, _STUN_TINT_SZ);

  const _wasAlive = c.alive;
  c.alive = true;
  c._maskMode = true;
  _stunTintCtx.save();
  _stunTintCtx.translate(half - c.x, half - c.y);
  c.draw(_stunTintCtx);
  _stunTintCtx.restore();
  c._maskMode = false;
  c.alive = _wasAlive;

  _stunTintCtx.globalCompositeOperation = 'source-atop';
  _stunTintCtx.globalAlpha = 0.55;
  _stunTintCtx.fillStyle = (c instanceof DarkNinjaCharacter) ? '#1D4E80' : '#3FA9F5';
  _stunTintCtx.fillRect(0, 0, _STUN_TINT_SZ, _STUN_TINT_SZ);
  _stunTintCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(_stunTintCanvas, c.x - half, c.y - half);
}

const G = {
  state:'menu', chars:[], projs:[], deathTimer:0, winnerText:'', btns:{},
  _finaleActive:false, _finaleGuardT:0,
  _onlineMode: null,   // ← ONLINE PATCH: 'pvp' | 'duos_boss' | null
  _engiInfiniteTurrets: false, // ENGINEER PATCH: toggle da seleção — desliga ao recarregar a página
  // Dog cutscene & phase 2
  _cutscene:null,         // cutscene state object
  _dogArenaExpanding:false, _dogArenaTimer:0,
  _dogPhase2Timer:0, _dogSubPhase:0, // 0=evade,1=reflect,2=final
  _orbitalDogs:[],        // for final attack
  _dogFinalTimer:0,
  _dogFinalRushing:false,

  start() {
    const t1=CHAR_TYPES[sel.p1], t2=CHAR_TYPES[sel.p2];
    if (t1.isCustomSlot || t2.isCustomSlot) return; // bloqueado
    // ← ONLINE PATCH: permite 2 PlayerCharacters só no modo online
    if (!this._onlineMode && (t1.isPlayer||t1.isPlayerCustom) && (t2.isPlayer||t2.isPlayerCustom)) return;
    const make=(idx,x,y)=>{
      const t=CHAR_TYPES[idx], Cls=t.cls||Character;
      return new Cls(x,y,t);
    };
    // Reset arena size
    AW = 475; AH = 475;
    this.chars=[make(sel.p1,135,270), make(sel.p2,405,270)];
    this.projs=[]; this.deathTimer=0; cam.reset(); this.state='playing'; _applyCursor();
    resetSentryEffects(); // ENGINEER PATCH: limpa partículas de sentries de partidas anteriores
    // Reset dog state
    this._cutscene=null;
    this._dogArenaExpanding=false; this._dogArenaTimer=0;
    this._dogPhase2Timer=0; this._dogSubPhase=0;
    this._orbitalDogs=[]; this._dogFinalTimer=0; this._dogFinalRushing=false;
    // ── Finale: inicia música imediatamente ao começar a partida ──
    this._finaleActive = this.chars.some(c => c instanceof FinaleCharacter);
    this._finaleGuardT = 0;
    if (this._finaleActive) SFX.playMusic('finale', 0.75);
    // Custom char music (if not Finale conflict)
    else {
      const customWithMusic = this.chars.find(c => c instanceof CustomCharacter && c._activeCfg && c._activeCfg._musicKey);
      // music will be started on first update frame by CustomCharacter
    }
  },

  update(dt) {
    if (this.state!=='playing') return;

    // ── ONLINE PATCH: delega pro online.js quando em partida online ──
    if (this._onlineMode && typeof this._onlineUpdate === 'function') {
      this._onlineUpdate(dt);
      return;
    }

    // ── CUTSCENE early return ──────────────────────────────────
    if (this._cutscene) { this._tickCutscene(dt); return; }

    const [c1,c2]=this.chars;

    // ── ENGINEER PATCH: sentry(s) no campo força(m) o inimigo a mirar na mais próxima ──
    const _engi = this.chars.find(ch => ch instanceof EngineerCharacter);
    const _engiAliveSentries = _engi ? _engi.sentries.filter(s => s.alive) : [];
    let _target1 = c2, _target2 = c1;
    if (_engiAliveSentries.length) {
      if (c1 === _engi) _target2 = _nearestSentry(_engiAliveSentries, c2.x, c2.y);
      else if (c2 === _engi) _target1 = _nearestSentry(_engiAliveSentries, c1.x, c1.y);
    }
    // ── DEBUFF GENÉRICO (Toxic Darter): aplica speedMult/cdMult sem exigir que
    // cada personagem exponha seus campos internos de movimento/cooldown.
    // speedMult: reescala o deslocamento (delta de posição) do frame.
    // cdMult: reescala o ganho de `charge` do frame (só afeta personagens que usam
    // esse campo genérico; Engineer/DarkNinja/Player são tratados nos próprios arquivos).
    const _preDebuff = (c) => ({ x:c.x, y:c.y, charge:c.charge||0 });
    const _postDebuff = (c, pre) => {
      if (c.speedMult !== 1) {
        c.x = pre.x + (c.x - pre.x) * c.speedMult;
        c.y = pre.y + (c.y - pre.y) * c.speedMult;
      }
      if (c.cdMult !== 1 && c.charge !== undefined) {
        const gained = c.charge - pre.charge;
        if (gained > 0) c.charge = Math.max(0, pre.charge + gained / c.cdMult);
      }
    };
    const _pc1 = this.projs.length;
    const _pre1 = _preDebuff(c1);
    c1.update(dt,_target1,this.projs);
    _postDebuff(c1, _pre1);
    const _pc2 = this.projs.length;
    const _pre2 = _preDebuff(c2);
    c2.update(dt,_target2,this.projs);
    _postDebuff(c2, _pre2);
    const _pc3 = this.projs.length;
    // Efeito "Confused" (do Sledge do Engineer): duplica o spread dos tiros
    // recém-criados por um dono confuso, aplicando um desvio aleatório no ângulo.
    const _applyConfJitter = (fromIdx, toIdx, owner) => {
      if (!owner) return;
      const confDeg = owner.confusedTimer > 0 ? _confusedSpreadDeg(owner) : 0;
      const poisonDeg = owner.spreadAddDeg || 0;
      const deg = confDeg + poisonDeg;
      if (deg <= 0) return;
      const rad = deg * Math.PI / 180;
      for (let i=fromIdx; i<toIdx; i++) {
        const p = this.projs[i];
        if (!p || p.vx===undefined) continue;
        const jitter = (Math.random()-0.5)*2*rad;
        const spd = Math.hypot(p.vx,p.vy);
        const ang = Math.atan2(p.vy,p.vx)+jitter;
        p.vx = Math.cos(ang)*spd; p.vy = Math.sin(ang)*spd;
      }
    };
    _applyConfJitter(_pc1,_pc2,c1);
    _applyConfJitter(_pc2,_pc3,c2);
    for (const _c of [c1,c2]) _c.confusedTimer = Math.max(0, (_c.confusedTimer||0) - dt);
    // ── Decaimento do tint verde de veneno (genérico — funciona mesmo se o
    // personagem morrer envenenado, e independe de qual char está poisonado) ──
    for (const _c of [c1,c2]) {
      if (_c._poisonTintT > 0) _c._poisonTintT = Math.max(0, _c._poisonTintT - dt);
    }
    // Atualiza as sentries (entidades separadas, fora de this.chars) e as partículas de explosão.
    // Importante: re-checa `s.alive` aqui (não usa o array cacheado acima), porque o
    // update() de c1/c2 já pode ter matado alguma sentry nesse mesmo frame (ex: o
    // "2 caras numa moto" atropelando ela) — chamar update() numa sentry morta
    // (ou usar uma referência null) é o que travava/crashava o jogo.
    if (_engi) {
      const _enemyOfEngi = _engi===c1 ? c2 : c1;
      for (const s of _engi.sentries) { if (s.alive) s.update(dt, _enemyOfEngi, this.projs); }
      _engi.sentries = _engi.sentries.filter(s => s.alive);
    }
    updateSentryParticles(dt);
    // ── fim patch Engineer ──────────────────────────────────────

    // ── Guardrail Finale: verifica a cada 3s se o áudio ainda está tocando ──
    if (this._finaleActive) {
      this._finaleGuardT+=dt;
      if (this._finaleGuardT>=3) { this._finaleGuardT=0; SFX.ensureMusic('finale',0.75); }
    }

    // ── DOG fake death detection ───────────────────────────────
    const dog = this.chars.find(c => c instanceof DogCharacter);
    const enemy = dog ? this.chars.find(c => c !== dog) : null;
    if (dog && dog._fakeDying && !this._cutscene) {
      this._startDogCutscene(dog, enemy);
      return;
    }

    // ── Arena expansion ───────────────────────────────────────
    if (this._dogArenaExpanding) {
      this._dogArenaTimer += dt;
      const t = Math.min(this._dogArenaTimer / 3.0, 1);
      const ease = 1 - Math.pow(1-t, 3);
      AW = Math.round(lerp(475, 600, ease));
      AH = Math.round(lerp(475, 600, ease));
      if (t >= 1) this._dogArenaExpanding = false;
    }

    for (const p of this.projs) {
      // Homing para projéteis refletidos
      if (p._homingTarget && p._homingTarget.alive) {
        const _hdx = p._homingTarget.x - p.x, _hdy = p._homingTarget.y - p.y;
        const _hl = Math.hypot(_hdx, _hdy) || 1;
        p.vx = _hdx/_hl*1500; p.vy = _hdy/_hl*1500;
      }
      p.update(dt); if (!p.alive) continue;
      // ── ENGINEER PATCH: projéteis de sentry pertencem à sentry, não a c1/c2 ──
      const _realOwner = (typeof Sentry !== 'undefined' && p.owner instanceof Sentry) ? p.owner.master : p.owner;
      const target = _realOwner===c1 ? c2 : c1;
      // Enquanto a sentry do Engineer estiver viva, tiros do inimigo dela só podem
      // atingir a sentry — o Engineer fica protegido ("forçado a atirar nela").
      if (target instanceof EngineerCharacter && target.sentries.length && !(p.owner instanceof Sentry)) {
        const _sentryHit = target.sentries.find(s => s.alive && p.hits(s));
        if (_sentryHit) {
          _sentryHit.takeDamage(p.dmg!==undefined?p.dmg:PROJ_DMG);
          // ENGINEER PATCH: mesmo gancho genérico de stun usado contra personagens
          // (ver char_custom.js onProjHit) também vale pra sentry — é o que faz
          // o SentryStop existir de fato, e não só tocar em teoria.
          if (_sentryHit.alive && p.owner && p.owner.onProjHit) p.owner.onProjHit(p, _sentryHit);
          p.alive = false;
          continue;
        }
        // Não acertou nenhuma sentry — segue pro cálculo normal de colisão contra o Engineer.
      }
      // ── fim patch Engineer ──────────────────────────────────────
      if (target.alive && p.hits(target)) {
        // ── Dog phase 2 reflect ────────────────────────────────
        if (target instanceof DogCharacter && target._phase===2) {
          if (this._dogSubPhase === 1) {
            if (enemy && enemy.hp < 300) {
              p.alive = false; // para de refletir, dog volta a teleportar
            } else {
              target.reflectProj(p, enemy);
              continue; // proj redirecionado, não morre
            }
          } else if (this._dogSubPhase === 0) {
            // Evade phase: teleport handles avoidance; if somehow hit, nothing
            p.alive = false;
          } else {
            p.alive = false;
          }
        } else if (p instanceof BaianoProj) {
          target.takeDamage(40 * (p.owner ? (p.owner.dmgMult||1) : 1));
          target.receiveZ(BAIANO_FREEZE_DUR);
          if (p.owner && p.owner.alive) p.owner.heal(10);
          p.alive = false;
        } else if (p instanceof LadraoProjeto) {
          target.takeDamage(RF_PROJ_DMG * (p.owner ? (p.owner.dmgMult||1) : 1));
          if (p.owner && p.owner.spawnMoney) p.owner.spawnMoney(p.x, p.y);
          p.alive = false;
        } else {
          const dmg=(p.dmg!==undefined?p.dmg:PROJ_DMG) * (p.owner ? (p.owner.dmgMult||1) : 1);
          // ENGINEER PATCH: tiros das torretas do Engineer não aplicam o slow padrão.
          const noSlow = (typeof Sentry !== 'undefined') && (p.owner instanceof Sentry);
          target.takeDamage(dmg, noSlow);
          if (p.healAmt && p.owner && p.owner.alive) p.owner.heal(p.healAmt);
          if (p.owner && p.owner.onProjHit) p.owner.onProjHit(p, target);
          p.alive = false;
        }
      }
    }
    this.projs=this.projs.filter(p=>p.alive && p.owner.alive);

    // ── Dog phase 2 timer ─────────────────────────────────────
    if (dog && dog._phase===2 && dog.alive) {
      this._dogPhase2Timer += dt;
      if (this._dogSubPhase===0 && this._dogPhase2Timer >= DOG_EVADE_DUR) {
        this._dogSubPhase = 1;
        dog._subPhase = 1;
        this._dogPhase2Timer = 0;
        // sem voiceline
      } else if (this._dogSubPhase===1 && this._dogPhase2Timer >= DOG_REFLECT_DUR) {
        this._dogSubPhase = 2;
        this._dogPhase2Timer = 0;
        this._startDogFinalAttack(dog, enemy);
      }
      // Final attack tick
      if (this._dogSubPhase===2) {
        this._tickDogFinalAttack(dt, dog, enemy);
      }
    }

    const ninjaShaking = this.chars.some(c => c instanceof DarkNinjaCharacter && c.alive && c._shakeT > 0);
    cam._shakeAmt = (dog && dog._phase === 2 && dog.alive) ? 2 : (ninjaShaking ? 3 : 0);
    // Câmera segue o player diretamente (ignora o update padrão de dois personagens)
    const playerChar = this.chars.find(c => c instanceof PlayerCharacter);
    cam.update(dt, this.chars);
    if (playerChar && playerChar.alive) {
      cam._tx = playerChar.x; cam._ty = playerChar.y;
      cam._tz = cam._bz() * 1.18;
    }

    // Skip death timer if dog is involved (dog never truly dies in phase 2)
    const nonDogDead = this.chars.some(c => !c.alive && !(c instanceof DogCharacter));
    if (nonDogDead || (dog && !dog.alive && !dog._fakeDying && dog._phase!==2)) {
      this.deathTimer+=dt;
      if (this.deathTimer>=LINGER_T) {
        const [d1,d2]=[!c1.alive,!c2.alive];
        this.winnerText=(d1&&d2)?'EMPATE!':(d1?c2.name:c1.name)+' VENCEU!';
        SFX.stopLoop('snoring');
        if (this._finaleActive) { SFX.stopMusic(); this._finaleActive=false; }
        this.state='gameover'; _applyCursor();
      }
    }
  },

  draw() {
    const cw=canvas.width/DPR, ch=canvas.height/DPR;
    ctx.save(); ctx.scale(DPR,DPR);
    ctx.fillStyle='#1BA3C4'; ctx.fillRect(0,0,cw,ch);
    ctx.restore();

    if (this.state==='menu') { this._drawMenu(); return; }

    // ── CUTSCENE draw ─────────────────────────────────────────
    if (this._cutscene) { this._drawCutscene(); return; }

    // Global shake — aplicado em tudo (mundo + HUD)
    ctx.save();
    if (cam._shakeX !== 0 || cam._shakeY !== 0) {
      ctx.translate(cam._shakeX * DPR, cam._shakeY * DPR);
    }
    ctx.save(); cam.apply(ctx);
    ctx.fillStyle='rgba(0,0,0,0.35)';
    ctx.fillRect(-BORDER+4,-BORDER+4,AW+BORDER*2,AH+BORDER*2);
    ctx.fillStyle='#0a0a0a';
    ctx.fillRect(-BORDER,-BORDER,AW+BORDER*2,AH+BORDER*2);
    ctx.fillStyle = '#29ABE2';
    ctx.fillRect(0,0,AW,AH);
    // (Sem borda colorida na fase 2 do Cachorro Caramelo)
    for (const p of this.projs) p.draw(ctx);
    for (const c of this.chars) if (c._drawPoisonPools) c._drawPoisonPools(ctx);
    for (const c of this.chars) c.draw(ctx);
    for (const c of this.chars) {
      if (c._poisonTintT > 0) _drawPoisonTint(ctx, c);
    }
    for (const c of this.chars) {
      if (c.freezeTimer > 0 && !isSilentlyStunned(c)) _drawStunTint(ctx, c);
    }

    // ── ENGINEER PATCH: desenha todas as sentries vivas e partículas de explosão ──
    for (const _drawEngi of this.chars) {
      if (!(_drawEngi instanceof EngineerCharacter)) continue;
      for (const s of _drawEngi.sentries) if (s.alive) s.draw(ctx);
    }
    drawSentryParticles(ctx);
    // ── fim patch Engineer ──────────────────────────────────────

    // Draw orbital dogs in final attack
    if (this._orbitalDogs.length > 0) this._drawOrbitalDogs(ctx);

    // World-space labels
    ctx.save(); ctx.textAlign='center';
    ctx.font='bold 36px Arial Black,sans-serif';
    const line1=`${this.chars[0].name} vs`;
    const line2=this.chars[1].name;
    const lineH=40;
    ctx.lineWidth=6; ctx.strokeStyle='#000';
    ctx.strokeText(line1,AW/2,-BORDER-62);
    ctx.fillStyle='white'; ctx.fillText(line1,AW/2,-BORDER-62);
    ctx.lineWidth=6; ctx.strokeStyle='#000';
    ctx.strokeText(line2,AW/2,-BORDER-62+lineH);
    ctx.fillStyle='white'; ctx.fillText(line2,AW/2,-BORDER-62+lineH);
    ctx.font='bold 30px Arial Black,sans-serif';
    ctx.lineWidth=6; ctx.strokeStyle='#000'; ctx.strokeText('@VggxYT',AW/2,AH+BORDER+34);
    const _vggHue1=120+60*(0.5+0.5*Math.sin(Date.now()/900));
    ctx.fillStyle=`hsl(${_vggHue1},85%,68%)`; ctx.fillText('@VggxYT',AW/2,AH+BORDER+34);
    ctx.restore();
    ctx.restore();

    // Screen-space HUD
    ctx.save(); ctx.scale(DPR,DPR);
    for (const c of this.chars) c.drawHUD(ctx,cam);
    _drawJoysticks(ctx);
    ctx.restore();

    // Fecha o shake global
    ctx.restore();

    if (this.state==='gameover') this._drawGameOver();
  },

  _drawMenu() {
    this.btns={};
    const cw=canvas.width/DPR, ch=canvas.height/DPR, cx=cw/2, cy=ch/2;
    ctx.save(); ctx.scale(DPR,DPR); ctx.textAlign='center';

    const titleFs=Math.min(60,cw*0.13);
    ctx.font=`bold ${titleFs}px Arial Black,sans-serif`;
    ctx.lineWidth=6; ctx.strokeStyle='#000'; ctx.strokeText('Box vs Box',cx,cy-110);
    ctx.fillStyle='white'; ctx.fillText('Box vs Box',cx,cy-110);

    const cardW=Math.min(145,cw*0.33), cardH=cardW*1.35;
    const gap=Math.min(70,cw*0.15);
    const lx=cx-gap/2-cardW, rx=cx+gap/2, cardY=cy-80;

    this._drawCard(ctx,lx,cardY,cardW,cardH,sel.p1,'P1',true);
    this._drawCard(ctx,rx,cardY,cardW,cardH,sel.p2,'P2',false);

    const vsSz=Math.min(40,gap*0.55);
    ctx.beginPath(); ctx.arc(cx,cardY+cardH/2,vsSz/2+4,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx,cardY+cardH/2,vsSz/2,0,Math.PI*2);
    ctx.fillStyle='#FFD700'; ctx.fill();
    ctx.font=`bold ${Math.min(16,vsSz*0.6)}px Arial Black,sans-serif`;
    ctx.fillStyle='#000'; ctx.fillText('VS',cx,cardY+cardH/2+5);

    const bw=Math.min(200,cw*0.52), bh=54, bx=cx-bw/2, by=cardY+cardH+18;
    const customSlotSelected = CHAR_TYPES[sel.p1].isCustomSlot || CHAR_TYPES[sel.p2].isCustomSlot;
    const isPlayerType = (idx) => !!(CHAR_TYPES[idx].isPlayer || CHAR_TYPES[idx].isPlayerCustom);
    const bothPlayer = isPlayerType(sel.p1) && isPlayerType(sel.p2);
    // Botão Customizar (só aparece se slot custom selecionado)
    if (customSlotSelected) {
      ctx.fillStyle='#8E44AD'; rrect(ctx,bx,by,bw,bh,13); ctx.fill();
      ctx.strokeStyle='#5B2C6F'; ctx.lineWidth=3; rrect(ctx,bx,by,bw,bh,13); ctx.stroke();
      ctx.font=`bold ${Math.min(20,cw*0.046)}px Arial Black,sans-serif`;
      oText(ctx,'⚙ CUSTOMIZAR',cx,by+37,'white','#2c0050',3);
      this.btns.customize={x:bx,y:by,w:bw,h:bh};
      // Botão Jogar bloqueado
      ctx.fillStyle='#555'; rrect(ctx,bx,by+bh+8,bw,bh,13); ctx.fill();
      ctx.font=`bold ${Math.min(23,cw*0.052)}px Arial Black,sans-serif`;
      oText(ctx,'▶  JOGAR',cx,by+bh+8+37,'#999','#222',3);
    } else if (bothPlayer) {
      // Ambos são controlados pelo jogador — bloquear
      this.btns.customize=null; this.btns.play=null;
      ctx.fillStyle='#C0392B'; rrect(ctx,bx,by,bw,bh,13); ctx.fill();
      ctx.strokeStyle='#922B21'; ctx.lineWidth=3; rrect(ctx,bx,by,bw,bh,13); ctx.stroke();
      ctx.font=`bold ${Math.min(14,cw*0.034)}px Arial Black,sans-serif`;
      oText(ctx,'⚠ VOCÊ vs VOCÊ MESMO!',cx,by+23,'white','#5B0000',2);
      oText(ctx,'Escolha um adversário diferente',cx,by+42,'#FFDADA','#5B0000',1);
    } else {
      this.btns.customize=null;
      ctx.fillStyle='#27AE60'; rrect(ctx,bx,by,bw,bh,13); ctx.fill();
      ctx.strokeStyle='#1a7a40'; ctx.lineWidth=3; rrect(ctx,bx,by,bw,bh,13); ctx.stroke();
      ctx.font=`bold ${Math.min(23,cw*0.052)}px Arial Black,sans-serif`;
      oText(ctx,'▶  JOGAR',cx,by+37,'white','#004d1a',3);
      this.btns.play={x:bx,y:by,w:bw,h:bh};
    }

    ctx.font='bold 22px Arial Black,sans-serif';
    ctx.lineWidth=4; ctx.strokeStyle='#000'; ctx.strokeText('@VggxYT',cx,ch-14);
    const _vggHue2=120+60*(0.5+0.5*Math.sin(Date.now()/900));
    ctx.fillStyle=`hsl(${_vggHue2},85%,68%)`; ctx.fillText('@VggxYT',cx,ch-14);
    ctx.restore();

    // Gear no menu (PC only)
    if (!_isMobile) {
      _drawSettingsGear(ctx, cw);
      if (_settingsUI.open) _drawSettingsPanel(ctx, cw, ch);
    }
  },

  _drawCard(c,x,y,w,h,typeIdx,label,isLeft) {
    const type=CHAR_TYPES[typeIdx];
    const isTiger  = type.cls===TigerCharacter;
    const isMoto   = type.cls===MotoCharacter;
    const isNeymar = type.cls===NeymarCharacter;
    const isBaiano = type.cls===BaianoCharacter;
    const isRF     = type.cls===ReceitaFederalCharacter;
    const isJevil  = type.cls===FinaleCharacter;
    const isDog    = type.cls===DogCharacter;
    const isEngi   = type.cls===EngineerCharacter;
    this.btns[isLeft?'p1EngiInf':'p2EngiInf']=null; // reseta — só existe quando o card é o Engineer
    rrect(c,x,y,w,h,12);
    // Card bg tint
    c.fillStyle=isTiger?'rgba(80,50,0,0.45)':isRF?'rgba(10,40,80,0.55)':isJevil?'rgba(20,0,40,0.72)':isDog?'rgba(30,15,0,0.55)':'rgba(0,0,0,0.28)'; c.fill();
    c.strokeStyle=isTiger?'rgba(255,215,0,0.6)':isRF?'rgba(100,180,255,0.7)':isJevil?'rgba(195,155,211,0.8)':isDog?'rgba(198,134,66,0.8)':'rgba(255,255,255,0.35)';
    c.lineWidth=2; c.stroke();

    c.font=`bold ${Math.min(13,w*0.095)}px Arial,sans-serif`;
    c.fillStyle='rgba(255,255,255,0.65)'; c.textAlign='center';
    c.fillText(label,x+w/2,y+16);

    const sq=Math.min(56,w*0.52), sqX=x+w/2-sq/2, sqY=y+h/2-sq/2-6;
    if (isTiger && imgOk(TIGER_IMGS.Tiger)) {
      c.drawImage(TIGER_IMGS.Tiger,sqX,sqY,sq,sq);
    } else if (isMoto && imgOk(MOTO_IMG)) {
      c.drawImage(MOTO_IMG,sqX,sqY,sq,sq);
    } else if (isNeymar && imgOk(NEYMAR_IMGS.Neymar)) {
      c.drawImage(NEYMAR_IMGS.Neymar,sqX,sqY,sq,sq);
    } else if (isBaiano && imgOk(BAIANO_IMG)) {
      // Comprimir Baiano na seleção também
      const bw=sq*(120/72)*0.6, bh=sq*0.6;
      c.drawImage(BAIANO_IMG,sqX+(sq-bw)/2,sqY+(sq-bh)/2,bw,bh);
    } else if (isRF && imgOk(RF_IMGS.ReceitaFederal)) {
      c.drawImage(RF_IMGS.ReceitaFederal,sqX,sqY,sq,sq);
    } else if (isDog && imgOk(DOG_IMGS.MainDog)) {
      c.drawImage(DOG_IMGS.MainDog,sqX,sqY,sq,sq);
    } else if (isEngi && imgOk(ENGI_IMG)) {
      c.drawImage(ENGI_IMG,sqX,sqY,sq,sq);
    } else if (type.cls===DarkNinjaCharacter && imgOk(DARKNINJA_IMGS.WinStartPose)) {
      c.drawImage(DARKNINJA_IMGS.WinStartPose,sqX,sqY,sq,sq);
    } else if (type.cls===ToxicDarterCharacter && imgOk(TOXICDARTER_IMGS.Front)) {
      c.drawImage(TOXICDARTER_IMGS.Front,sqX,sqY,sq,sq);
    } else if (isJevil) {
      // Desenha o losango do Jevil no card de seleção
      const cx2=sqX+sq/2, cy2=sqY+sq/2, r=sq*0.46;
      c.save();
      c.shadowColor='#9B59B6'; c.shadowBlur=12;
      c.beginPath();
      c.moveTo(cx2,cy2-r); c.lineTo(cx2+r,cy2); c.lineTo(cx2,cy2+r); c.lineTo(cx2-r,cy2);
      c.closePath();
      c.fillStyle='#1a0030'; c.fill();
      c.strokeStyle='#C39BD3'; c.lineWidth=2; c.stroke();
      c.shadowBlur=0;
      c.font=`bold ${Math.round(sq*0.38)}px Arial Black,sans-serif`;
      c.textAlign='center'; c.textBaseline='middle';
      c.fillStyle='#E8D5F5'; c.fillText('⚙',cx2,cy2+1);
      c.restore();
    } else if ((type.isCustom || type.isPlayerCustom) && type.cfg && type.cfg._charImgEl && imgOk(type.cfg._charImgEl)) {
      c.drawImage(type.cfg._charImgEl,sqX,sqY,sq,sq);
    } else {
      c.fillStyle=type.color; c.fillRect(sqX,sqY,sq,sq);
      c.strokeStyle='white'; c.lineWidth=2.5; c.strokeRect(sqX,sqY,sq,sq);
    }

    c.font=`bold ${Math.min(10,w*0.085)}px Arial,sans-serif`;
    c.fillStyle=isTiger?'#FFD700':isRF?'#85C1E9':isJevil?'#C39BD3':isDog?'#C68642':'white'; c.textAlign='center';
    c.fillText(type.name,x+w/2,sqY+sq+16);

    // Contador de posição no carrossel (ex: "14/16") — deixa claro que há mais
    // personagens além dos 2 cards visíveis, evitando parar antes de chegar neles.
    c.font=`${Math.min(9,w*0.075)}px Arial,sans-serif`;
    c.fillStyle='rgba(255,255,255,0.5)';
    c.fillText(`${typeIdx+1}/${CHAR_TYPES.length}`,x+w/2,sqY+sq+28);

    const aSz=26;
    const arL={x:x+3,       y:y+h/2-aSz/2, w:aSz, h:aSz};
    const arR={x:x+w-aSz-3, y:y+h/2-aSz/2, w:aSz, h:aSz};
    for (const ar of [arL,arR]) {
      c.fillStyle='rgba(255,255,255,0.22)'; rrect(c,ar.x,ar.y,ar.w,ar.h,6); c.fill();
    }
    c.fillStyle='white'; c.font=`bold ${aSz-4}px Arial`; c.textAlign='center';
    c.fillText('‹',arL.x+arL.w/2,arL.y+arL.h/2+7);
    c.fillText('›',arR.x+arR.w/2,arR.y+arR.h/2+7);
    this.btns[isLeft?'p1L':'p2L']=arL;
    this.btns[isLeft?'p1R':'p2R']=arR;

    // Botão deletar — aparece direto no card quando é um char customizado
    if (type.isCustom) {
      // Lápis (editar)
      const eb={x:x+w-44,y:y+4,w:18,h:18};
      rrect(c,eb.x,eb.y,eb.w,eb.h,5);
      c.fillStyle='#2471A3'; c.fill();
      c.font='bold 11px Arial'; c.fillStyle='white'; c.textAlign='center';
      c.fillText('✏️',eb.x+eb.w/2,eb.y+eb.h/2+4);
      this.btns[isLeft?'p1Edit':'p2Edit']=eb;
      // Lixeira (deletar)
      const db={x:x+w-22,y:y+4,w:18,h:18};
      rrect(c,db.x,db.y,db.w,db.h,5);
      c.fillStyle='#C0392B'; c.fill();
      c.font='bold 11px Arial'; c.fillStyle='white'; c.textAlign='center';
      c.fillText('🗑',db.x+db.w/2,db.y+db.h/2+4);
      this.btns[isLeft?'p1Del':'p2Del']=db;
    } else if (type.isPlayerCustom) {
      // Lápis (editar)
      const eb={x:x+w-44,y:y+4,w:18,h:18};
      rrect(c,eb.x,eb.y,eb.w,eb.h,5);
      c.fillStyle='#2471A3'; c.fill();
      c.font='bold 11px Arial'; c.fillStyle='white'; c.textAlign='center';
      c.fillText('✏️',eb.x+eb.w/2,eb.y+eb.h/2+4);
      this.btns[isLeft?'p1Edit':'p2Edit']=eb;
      // Lixeira (deletar)
      const db={x:x+w-22,y:y+4,w:18,h:18};
      rrect(c,db.x,db.y,db.w,db.h,5);
      c.fillStyle='#C0392B'; c.fill();
      c.font='bold 11px Arial'; c.fillStyle='white'; c.textAlign='center';
      c.fillText('🗑',db.x+db.w/2,db.y+db.h/2+4);
      this.btns[isLeft?'p1Del':'p2Del']=db;
    } else if (type.isPlayer) {
      // Lápis no "Você" padrão → cria/edita o custom
      const eb={x:x+w-22,y:y+4,w:18,h:18};
      rrect(c,eb.x,eb.y,eb.w,eb.h,5);
      c.fillStyle='#2471A3'; c.fill();
      c.font='bold 11px Arial'; c.fillStyle='white'; c.textAlign='center';
      c.fillText('✏️',eb.x+eb.w/2,eb.y+eb.h/2+4);
      this.btns[isLeft?'p1Edit':'p2Edit']=eb;
      this.btns[isLeft?'p1Del':'p2Del']=null;
    } else if (isEngi) {
      // Botão de torretas infinitas: vermelho (desligado, padrão) / roxo (ligado).
      // É um toggle global — reseta ao recarregar a página (não é salvo em disco).
      const active = !!G._engiInfiniteTurrets;
      const tb={x:x+w-22,y:y+4,w:18,h:18};
      rrect(c,tb.x,tb.y,tb.w,tb.h,5);
      c.fillStyle = active ? '#8E44AD' : '#C0392B'; c.fill();
      c.strokeStyle='rgba(255,255,255,0.8)'; c.lineWidth=1.5; rrect(c,tb.x,tb.y,tb.w,tb.h,5); c.stroke();
      c.font='bold 11px Arial Black,sans-serif'; c.fillStyle='white'; c.textAlign='center';
      c.fillText('∞',tb.x+tb.w/2,tb.y+tb.h/2+4);
      this.btns[isLeft?'p1EngiInf':'p2EngiInf']=tb;
      this.btns[isLeft?'p1Del':'p2Del']=null;
      this.btns[isLeft?'p1Edit':'p2Edit']=null;
    } else {
      this.btns[isLeft?'p1Del':'p2Del']=null;
      this.btns[isLeft?'p1Edit':'p2Edit']=null;
    }
  },

  _drawGameOver() {
    const cw=canvas.width/DPR, ch=canvas.height/DPR;
    ctx.save(); ctx.scale(DPR,DPR);
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,cw,ch);
    ctx.textAlign='center';
    const cx=cw/2, cy=ch/2;
    const bw=Math.min(420,cw*0.85), bh=130;
    rrect(ctx,cx-bw/2,cy-90,bw,bh,18);
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fill();
    ctx.strokeStyle='#FFD700'; ctx.lineWidth=3; ctx.stroke();
    ctx.font=`bold ${Math.min(46,cw*0.09)}px Arial Black,sans-serif`;
    oText(ctx,this.winnerText,cx,cy-30,'#FFD700','#000',5);
    const rw=Math.min(220,cw*0.58), rh=54, rx=cx-rw/2, ry=cy+30;
    ctx.fillStyle='#2980B9'; rrect(ctx,rx,ry,rw,rh,13); ctx.fill();
    ctx.font=`bold ${Math.min(18,cw*0.045)}px Arial Black,sans-serif`;
    oText(ctx,'JOGAR NOVAMENTE',cx,ry+36,'white','#000',3);
    this.btns.play={x:rx,y:ry,w:rw,h:rh};
    ctx.restore();
  },

  // ── DOG: start cutscene ───────────────────────────────────────
  _startDogCutscene(dog, enemy) {
    SFX.play('fakeDeath', 1.0);
    this._cutscene = {
      phase: 'black',      // black | souls | orbiting | flash
      timer: 0,
      musicStarted: false,
      souls: [],           // [{key, alpha, slot}]
      orbiting: false,
      orbitT: 0,
      flashAlpha: 0,
      dog, enemy,
    };
  },

  _tickCutscene(dt) {
    const cs = this._cutscene;
    cs.timer += dt;

    if (cs.phase === 'black') {
      // After 1s start music and souls phase
      if (cs.timer >= 1.0 && !cs.musicStarted) {
        cs.musicStarted = true;
        SFX.playMusic('finale', 0.85);
        cs.musicT = 0;
        cs.phase = 'souls';
        cs.timer = 0;
      }
      return;
    }

    if (cs.phase === 'souls') {
      cs.musicT = (cs.musicT||0) + dt;
      const mt = cs.musicT;

      // Spawn souls at correct timing
      for (let i = 0; i < SOUL_TIMINGS.length; i++) {
        const t = SOUL_TIMINGS[i];
        if (mt >= t && !cs.souls.find(s => s.idx === i)) {
          const isMain = i === 6;
          cs.souls.push({
            idx: i,
            key: isMain ? 'MainDog' : SOUL_SLOTS[i].key,
            alpha: 0,
            slot: isMain ? null : SOUL_SLOTS[i],
            isMain,
          });
        }
      }

      // Fade in souls
      for (const s of cs.souls) {
        s.alpha = Math.min(1, s.alpha + dt * 1.2);
      }

      // After MainDog (idx=6) fully appeared + 1s, start orbiting
      const mainSoul = cs.souls.find(s => s.isMain);
      if (mainSoul && mainSoul.alpha >= 1 && !cs.orbiting) {
        cs._postMainTimer = (cs._postMainTimer||0) + dt;
        if (cs._postMainTimer >= 1.0) {
          cs.orbiting = true;
          cs.orbitT = 0;
          cs.orbitSpd = 1.5;
        }
      }

      if (cs.orbiting) {
        cs.orbitT += dt;
        // Speed ramps up each second
        cs.orbitSpd = 1.5 + cs.orbitT * 1.2;

        if (cs.orbitT >= 3.0) {
          // Flash
          cs.phase = 'flash';
          cs.timer = 0;
        }
      }
      return;
    }

    if (cs.phase === 'flash') {
      cs.flashAlpha = Math.min(1, cs.timer * 8); // sobe rápido em ~0.125s
      if (cs.flashAlpha >= 1) {
        this._endDogCutscene(cs); // volta imediatamente no pico
      }
    }
  },

  _endDogCutscene(cs) {
    const dog = cs.dog, enemy = cs.enemy;
    this._cutscene = null;
    // Revive dog in phase 2
    dog._fakeDying = false;
    dog.alive = true;
    dog._phase = 2;
    dog.hp = DOG_HP2; dog.maxHp = DOG_HP2;
    dog.x = AW/2; dog.y = AH/2;
    dog._evadeTimer = 0; dog._evading = false; dog._evadeAlpha = 1;
    // Start arena expansion
    AW = 475; AH = 475;
    this._dogArenaExpanding = true;
    this._dogArenaTimer = 0;
    this._dogPhase2Timer = 0;
    this._dogSubPhase = 0;
    this.projs = [];
    cam.reset();
  },

  _drawCutscene() {
    const cs = this._cutscene;
    const cw=canvas.width/DPR, ch=canvas.height/DPR;
    // Black background — usa raw canvas pixels para garantir cobertura total
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(DPR,DPR);

    if (cs.phase === 'souls' || cs.phase === 'flash') {
      const cx = cw/2, cy = ch/2;
      const baseR = Math.min(cw, ch) * 0.36;
      const orbitAng = cs.orbiting ? cs.orbitT * cs.orbitSpd : 0;

      for (const s of cs.souls) {
        if (s.alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha = s.alpha;

        let sx, sy;
        if (s.isMain) {
          sx = cx; sy = cy;
        } else {
          const ang = s.slot.angle + orbitAng;
          sx = cx + Math.cos(ang)*baseR;
          sy = cy + Math.sin(ang)*baseR;
        }

        const sz = s.isMain ? 110 : 76;
        const img = DOG_IMGS[s.key];
        if (s.isMain) {
          // MainDog: sem recorte, imagem livre
          if (imgOk(img)) {
            ctx.drawImage(img, sx-sz/2, sy-sz/2, sz, sz);
          } else {
            ctx.fillStyle='#FF0000'; ctx.beginPath(); ctx.arc(sx,sy,sz/2,0,Math.PI*2); ctx.fill();
          }
        } else {
          // Periféricos: clip circular
          ctx.save();
          ctx.beginPath(); ctx.arc(sx, sy, sz/2, 0, Math.PI*2); ctx.clip();
          if (imgOk(img)) {
            ctx.drawImage(img, sx-sz/2, sy-sz/2, sz, sz);
          } else {
            ctx.fillStyle='#FFFFFF'; ctx.fill();
          }
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // Flash overlay
    if (cs.phase === 'flash' && cs.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = cs.flashAlpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }

    ctx.restore();
  },

  // ── DOG FINAL ATTACK ─────────────────────────────────────────
  _startDogFinalAttack(dog, enemy) {
    if (enemy) {
      enemy.freezeTimer = 9999; // freeze enemy
      enemy.slowTimer = 0;
    }
    // Build orbital dogs
    this._orbitalDogs = SOUL_SLOTS.map((slot, i) => ({
      key: slot.key,
      angle: slot.angle,
      r: 160,
      alpha: 1,
      rushing: false,
      done: false,
    }));
    this._dogFinalTimer = 0;
    this._dogFinalRushing = false;
  },

  _tickDogFinalAttack(dt, dog, enemy) {
    this._dogFinalTimer += dt;
    const t = this._dogFinalTimer;

    if (!this._dogFinalRushing) {
      // 5s of orbiting — getting faster and closer
      const progress = Math.min(t / DOG_FINAL_DUR, 1);
      const spd = 2.5 + progress * 8;
      const r   = lerp(160, 60, progress);
      for (const od of this._orbitalDogs) {
        od.angle += dt * spd;
        od.r = r;
      }
      if (t >= DOG_FINAL_DUR) {
        this._dogFinalRushing = true;
        for (const od of this._orbitalDogs) od.rushing = true;
      }
    } else {
      // Rush to enemy center
      if (!enemy) { this._dogFinalEnd(dog, enemy); return; }
      for (const od of this._orbitalDogs) {
        if (od.done) continue;
        // Each dog rushes at blinding speed
        od.r = Math.max(0, od.r - dt * 800);
        // Shrink alpha as they converge
        od.alpha = od.r / 60;
        if (od.r <= 0) od.done = true;
      }
      if (this._orbitalDogs.every(od => od.done)) {
        this._dogFinalEnd(dog, enemy);
      }
    }
  },

  _dogFinalEnd(dog, enemy) {
    // White flash + instant kill
    if (enemy) {
      enemy.hp = 0; enemy.alive = false;
      enemy.freezeTimer = 0;
      SFX.play('death', 1.0);
    }
    this._orbitalDogs = [];
    this._dogSubPhase = 3; // done
    this.deathTimer = 0;
  },

  _drawOrbitalDogs(c) {
    const enemy= this.chars.find(ch => !(ch instanceof DogCharacter));
    const cx = enemy ? enemy.x : AW/2;
    const cy = enemy ? enemy.y : AH/2;

    for (const od of this._orbitalDogs) {
      if (od.done) continue;
      const x = cx + Math.cos(od.angle)*od.r;
      const y = cy + Math.sin(od.angle)*od.r;
      const img = DOG_IMGS[od.key];
      const sz = 44;
      c.save();
      c.globalAlpha = clamp(od.alpha, 0, 1);
      if (imgOk(img)) {
        c.drawImage(img, x-sz/2, y-sz/2, sz, sz);
      } else {
        c.fillStyle='#FFD700'; c.beginPath(); c.arc(x,y,sz/2,0,Math.PI*2); c.fill();
      }
      c.restore();
    }
  },

  tap(mx,my) {
    const lx=mx/DPR, ly=my/DPR;
    const hit=b=>b&&lx>=b.x&&lx<=b.x+b.w&&ly>=b.y&&ly<=b.y+b.h;
    if (hit(this.btns.play)) {
      if (this.state==='menu')     { this.start(); return; }
      if (this.state==='gameover') { SFX.stopLoop('snoring'); SFX.stopMusic(); this._finaleActive=false; this.state='menu'; _applyCursor(); return; }
    }
    if (this.state==='menu' && hit(this.btns.customize)) {
      openEditor(); return;
    }
    if (this.state==='menu') {
      const n=CHAR_TYPES.length;
      const _isPlayerType = (idx) => !!(CHAR_TYPES[idx].isPlayer || CHAR_TYPES[idx].isPlayerCustom);
      if (hit(this.btns.p1L)) {
        let tries=0;
        do { sel.p1=(sel.p1-1+n)%n; tries++; }
        while (tries<n && _isPlayerType(sel.p1) && _isPlayerType(sel.p2));
        return;
      }
      if (hit(this.btns.p1R)) {
        let tries=0;
        do { sel.p1=(sel.p1+1)%n; tries++; }
        while (tries<n && _isPlayerType(sel.p1) && _isPlayerType(sel.p2));
        return;
      }
      if (hit(this.btns.p2L)) {
        let tries=0;
        do { sel.p2=(sel.p2-1+n)%n; tries++; }
        while (tries<n && _isPlayerType(sel.p1) && _isPlayerType(sel.p2));
        return;
      }
      if (hit(this.btns.p2R)) {
        let tries=0;
        do { sel.p2=(sel.p2+1)%n; tries++; }
        while (tries<n && _isPlayerType(sel.p1) && _isPlayerType(sel.p2));
        return;
      }
      const _delCustom = async (pSel) => {
        const type = CHAR_TYPES[pSel];
        if (type && type.isPlayerCustom) {
          if (!confirm(`Deletar "${type.name}"?`)) return;
          deletePlayerCustom();
          await initPlayerCustom();
          await initCustomChars();
          const n = CHAR_TYPES.length;
          if (sel.p1 >= n) sel.p1 = n - 1;
          if (sel.p2 >= n) sel.p2 = n - 1;
          if (sel.p1 === 0 && sel.p2 === 0 && n > 1) sel.p2 = 1;
          return;
        }
        const saved = loadCustomChars();
        const customIdx = pSel - _baseCharCount;
        if (customIdx < 0 || customIdx >= saved.length) return;
        if (!confirm(`Deletar "${saved[customIdx].name}"?`)) return;
        saved.splice(customIdx, 1);
        saveCustomChars(saved);
        await initCustomChars();
        const n = CHAR_TYPES.length;
        if (sel.p1 >= n) sel.p1 = n - 1;
        if (sel.p2 >= n) sel.p2 = n - 1;
        if (sel.p1 === 0 && sel.p2 === 0 && n > 1) sel.p2 = 1;
      };
      const _editPlayer = (pSel) => {
        const type = CHAR_TYPES[pSel];
        if (type && type.isPlayerCustom) {
          openEditorForPlayer(true);
        } else if (type && type.isCustom) {
          const customIdx = pSel - _baseCharCount;
          $('editor').style.display = 'block';
          edEditChar(customIdx);
        } else {
          openEditorForPlayer(false);
        }
      };
      if (hit(this.btns.p1Del)) { _delCustom(sel.p1); return; }
      if (hit(this.btns.p2Del)) { _delCustom(sel.p2); return; }
      if (hit(this.btns.p1Edit)) { _editPlayer(sel.p1); return; }
      if (hit(this.btns.p2Edit)) { _editPlayer(sel.p2); return; }
      if (hit(this.btns.p1EngiInf) || hit(this.btns.p2EngiInf)) {
        this._engiInfiniteTurrets = !this._engiInfiniteTurrets;
        return;
      }
    }
  },

  // ── ONLINE PATCH: volta ao menu e reseta estado online ─────
  returnToMenu() {
    this._onlineMode = null;
    this.state = 'menu';
    this.chars = []; this.projs = [];
    AW = 475; AH = 475;
    SFX.stopMusic?.(); SFX.stopLoop?.('snoring');
    this._finaleActive = false;
    if (typeof cam !== 'undefined') cam.reset?.();
    if (typeof _applyCursor !== 'undefined') _applyCursor();
    if (typeof resetSentryEffects === 'function') resetSentryEffects(); // ENGINEER PATCH
  },
};

