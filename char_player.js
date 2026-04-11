// ── PLAYER CHARACTER ───────────────────────────────────────────
const PLAYER_HP        = 1000;
const PLAYER_SZ        = 65;
const PLAYER_SPD       = 200;
const PLAYER_DMG       = 30;
const PLAYER_BURST     = 4;
const PLAYER_SHOT_DLY  = 0.12;
const PLAYER_RELOAD    = 1.5;
const PLAYER_PROJ_SPD  = 580;

// Input state — preenchido pelo sistema de joystick/teclado
const playerInput = {
  moveX: 0, moveY: 0,
  aimX:  0, aimY:  0,
  shootTap: false,
  _aimActive: false,
  _burstLeft: 0, _burstAx: 0, _burstAy: 0,
  _arrowAiming: false,
  _mouseAimActive: false,
  _mouseWorldX: 0, _mouseWorldY: 0,
};

// ── PC SETTINGS ────────────────────────────────────────────────
const _isMobile = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

function _loadPCSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('gb_pc_settings') || '{}');
    return {
      autoFireKey: s.autoFireKey || 'Space',
      aimMode:     s.aimMode     || 'mouse', // 'mouse' | 'joystick'
      joySize:     s.joySize     != null ? s.joySize : 100,
    };
  } catch(e) { return { autoFireKey:'Space', aimMode:'mouse', joySize:100 }; }
}
const _pcSettings = _loadPCSettings();
function _savePCSettings() {
  try { localStorage.setItem('gb_pc_settings', JSON.stringify(_pcSettings)); } catch(e) {}
  _applyCursor();
}
function _applyCursor() {
  const playing = G && G.state === 'playing';
  canvas.style.cursor = (!_isMobile && _pcSettings.aimMode==='mouse' && playing) ? 'none' : 'default';
}
// Aplica cursor inicial (ainda na seleção, então sempre 'default')
canvas.style.cursor = 'default';

// UI state para o painel de configurações (PC)
const _settingsUI = {
  open: false,
  rebinding: false,
  _draggingSlider: false,
  _gearBtn: null,   // { x, y, r } — em px lógicos (CSS)
  _panelBtns: {},   // mapa de botões clicáveis
  _panelRect: null, // bounds do painel
};

// Posição do mouse em CSS px (rastreada globalmente)
const _mousePos = { x:0, y:0, inCanvas:false };
window.addEventListener('mousemove', e => { _mousePos.x=e.clientX; _mousePos.y=e.clientY; }, { passive:true });
canvas.addEventListener('mouseenter', () => { _mousePos.inCanvas=true;  });
canvas.addEventListener('mouseleave', () => { _mousePos.inCanvas=false; });

class PlayerCharacter extends Character {
  constructor(x, y, type) {
    super(x, y, type);
    this.hp = PLAYER_HP; this.maxHp = PLAYER_HP; this.sz = PLAYER_SZ;
    this.vx = 0; this.vy = 0;
    // Vars de instância — podem ser sobrescritas por subclasses (ex: PlayerCustomCharacter)
    this._spd       = PLAYER_SPD;
    this._burst     = PLAYER_BURST;
    this._shotDly   = PLAYER_SHOT_DLY;
    this._reload    = PLAYER_RELOAD;
    this._projSpd   = PLAYER_PROJ_SPD;
    this._projDmg   = PLAYER_DMG;
    this._projSzVal = 10;
    this._projHbVal = 10;
    this._pcfg      = null;
    this._shotsLeft  = PLAYER_BURST;
    this._shotTimer  = 0;
    this._reloadTimer = 0;
    this._reloadSoundPlayed = false;
    this._readyTimer  = 0.6;
    this._idleTimer   = 0;   // conta tempo sem atirar/levar dano
    this._regenAccum  = 0;   // acumulador de regen (dispara a cada 1s)
    this._regenIdle   = 5.0; // segundos parado para regen iniciar (padrão do player)
    this._regenHPS    = 100; // HP regenerado por segundo
    this._aimAngle   = 0;
    this._showAim    = false;
  }

  update(dt, other, projs) {
    if (!this.alive) { this._tickLabel(dt); return; }
    this.hitFlash  = Math.max(0, this.hitFlash-dt);
    this.slowTimer = Math.max(0, this.slowTimer-dt);
    this.freezeTimer = Math.max(0, this.freezeTimer-dt);
    this._collideCD = Math.max(0, this._collideCD-dt);
    if (this.freezeTimer > 0) { this._tickLabel(dt); return; }
    this._move(dt, other);
    this._shoot(dt, other, projs);
    // ── Regeneração passiva ──
    this._idleTimer += dt;
    if (this._regenIdle > 0 && this._regenHPS > 0 && this._idleTimer >= this._regenIdle && this.hp < this.maxHp) {
      this._regenAccum += dt;
      if (this._regenAccum >= 1.0) {
        this._regenAccum -= 1.0;
        this.heal(this._regenHPS);
        SFX.playPitched('playerHeal', -0.25, 0.25, 2.0);
      }
    } else if (this._idleTimer < this._regenIdle) {
      this._regenAccum = 0;
    }
    this._tickLabel(dt);
  }

  takeDamage(v) {
    super.takeDamage(v);
    this._idleTimer  = 0;
    this._regenAccum = 0;
  }

  _move(dt, other) {
    // ── ONLINE PATCH: remote player usa inputs de rede ──────────
    // Se é char remoto mas ainda sem input: fica parado (não usa playerInput)
    if (this._isRemote && !this._remoteMove) return;
    if (this._remoteMove) {
      const ri = this._remoteMove;
      let mx = ri.moveX || 0, my = ri.moveY || 0;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      const sp = this.slowTimer > 0 ? 0.25 : 1;
      this.x += mx * this._spd * sp * dt;
      this.y += my * this._spd * sp * dt;
      const h = this.sz / 2;
      if (this.x - h < 0)  this.x = h;
      if (this.x + h > AW) this.x = AW - h;
      if (this.y - h < 0)  this.y = h;
      if (this.y + h > AH) this.y = AH - h;
      if (other && other.alive && !other.noCollide && this._collideCD <= 0) {
        const dx = other.x - this.x, dy = other.y - this.y;
        const dist = Math.hypot(dx, dy);
        const minD = (this.sz + other.sz) / 2;
        if (dist < minD && dist > 0) {
          const nx = dx/dist, ny = dy/dist;
          this.x -= nx*(minD-dist)*0.5; this.y -= ny*(minD-dist)*0.5;
          this._collideCD = 0.1;
        }
      }
      return;
    }
    // ── fim patch ───────────────────────────────────────────────
    let mx = playerInput.moveX, my = playerInput.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const sp = this.slowTimer > 0 ? 0.25 : 1;
    this.x += mx * this._spd * sp * dt;
    this.y += my * this._spd * sp * dt;
    const h = this.sz / 2;
    if (this.x - h < 0)  this.x = h;
    if (this.x + h > AW) this.x = AW-h;
    if (this.y - h < 0)  this.y = h;
    if (this.y + h > AH) this.y = AH-h;
    // Colisão com o outro personagem — sem som
    if (other && other.alive && !other.noCollide && this._collideCD <= 0) {
      const dx = other.x - this.x, dy = other.y - this.y;
      const dist = Math.hypot(dx, dy);
      const minD = (this.sz + other.sz) / 2;
      if (dist < minD && dist > 0) {
        const nx = dx/dist, ny = dy/dist;
        this.x -= nx*(minD-dist)*0.5; this.y -= ny*(minD-dist)*0.5;
        this._collideCD = 0.1;
      }
    }
  }

  _shoot(dt, other, projs) {
    // ── ONLINE PATCH: remote player usa inputs de rede ──────────
    // Se é char remoto mas ainda sem input: não dispara (não usa playerInput)
    if (this._isRemote && !this._remoteMove) return;
    if (this._remoteMove) {
      const ri = this._remoteMove;
      // Atualiza mira
      if (ri.aimX !== 0 || ri.aimY !== 0) {
        this._aimAngle = Math.atan2(ri.aimY, ri.aimX);
        this._showAim = true;
      } else { this._showAim = false; }
      if (this._readyTimer > 0) {
        this._readyTimer -= dt; ri.shootTap = false; ri._burstLeft = 0; return;
      }
      if (this._reloadTimer > 0) {
        this._reloadTimer -= dt;
        if (!this._reloadSoundPlayed && this._reloadTimer <= this._reload * 0.5) {
          this._reloadSoundPlayed = true; SFX.play('playerReload', 0.9);
        }
        return;
      }
      if (this._shotsLeft <= 0) this._shotsLeft = this._burst;
      if (this._shotTimer > 0) { this._shotTimer -= dt; return; }
      if (this.freezeTimer > 0) return;
      if (ri.shootTap) {
        ri.shootTap = false;
        ri._burstLeft = this._burst;
        if (other && other.alive) {
          const dx = other.x - this.x, dy = other.y - this.y;
          const len = Math.hypot(dx, dy) || 1;
          ri._burstAx = dx/len; ri._burstAy = dy/len;
        } else { ri._burstAx = Math.cos(this._aimAngle); ri._burstAy = Math.sin(this._aimAngle); }
      }
      if ((ri._burstLeft || 0) > 0) {
        const ax = ri._burstAx || Math.cos(this._aimAngle);
        const ay = ri._burstAy || Math.sin(this._aimAngle);
        const _gH = 44;
        const _gW = imgOk(PLAYER_GUN_IMG) ? _gH*(PLAYER_GUN_IMG.naturalWidth/PLAYER_GUN_IMG.naturalHeight) : 76;
        const spawnX = this.x + Math.cos(Math.atan2(ay,ax)) * (this.sz/2+6+_gW);
        const spawnY = this.y + Math.sin(Math.atan2(ay,ax)) * (this.sz/2+6+_gW);
        const p = new Proj(spawnX, spawnY, ax*this._projSpd, ay*this._projSpd, this);
        p.dmg = this._projDmg; p._projSz = this._projSzVal; p._hitboxSz = this._projHbVal;
        projs.push(p);
        SFX.playPitched('playerShoot', -1.5, 1.5, 0.75);
        this._idleTimer = 0; this._regenAccum = 0;
        this._shotTimer = this._shotDly;
        this._shotsLeft -= 1; ri._burstLeft--;
        if (this._shotsLeft <= 0) {
          this._reloadTimer = this._reload; this._reloadSoundPlayed = false; ri._burstLeft = 0;
        }
      }
      return;
    }
    // ── fim patch ───────────────────────────────────────────────

    // ── Ready delay — impede disparo acidental no início ──
    if (this._readyTimer > 0) {
      this._readyTimer -= dt;
      // Atualiza mira mas não dispara
      if (!_isMobile && _pcSettings.aimMode === 'mouse' && playerInput._mouseAimActive) {
        const dx = playerInput._mouseWorldX - this.x;
        const dy = playerInput._mouseWorldY - this.y;
        if (Math.hypot(dx, dy) > 5) this._aimAngle = Math.atan2(dy, dx);
        this._showAim = true;
      } else if (playerInput._aimActive && (playerInput.aimX !== 0 || playerInput.aimY !== 0)) {
        this._aimAngle = Math.atan2(playerInput.aimY, playerInput.aimX);
        this._showAim  = true;
      } else {
        this._showAim = false;
      }
      // Descarta qualquer input acumulado do clique que iniciou a partida
      playerInput.shootTap = false;
      playerInput._burstLeft = 0;
      return;
    }

    // ── Atualiza ângulo de mira SEMPRE (mesmo recarregando/stunnado) ──
    if (!_isMobile && _keys[_pcSettings.autoFireKey] && other && other.alive) {
      // Autofire tem prioridade: aponta e atira no inimigo (independente do modo de mira)
      const dx = other.x - this.x, dy = other.y - this.y;
      const len = Math.hypot(dx, dy) || 1;
      playerInput._burstAx = dx / len;
      playerInput._burstAy = dy / len;
      this._aimAngle = Math.atan2(dy, dx);
      this._showAim  = false;
      // Mantém o burst ativo enquanto a tecla está segurada
      if (playerInput._burstLeft <= 0) playerInput._burstLeft = this._burst;
    } else if (playerInput._burstLeft > 0) {
      // Burst em andamento: mantém a mira na direção do disparo (prioridade sobre mouse/joystick)
      this._aimAngle = Math.atan2(playerInput._burstAy, playerInput._burstAx);
      this._showAim  = false;
    } else if (!_isMobile && _pcSettings.aimMode === 'mouse' && playerInput._mouseAimActive) {
      // Mouse mode: só assume controle quando não há burst ativo
      const dx = playerInput._mouseWorldX - this.x;
      const dy = playerInput._mouseWorldY - this.y;
      if (Math.hypot(dx, dy) > 5) this._aimAngle = Math.atan2(dy, dx);
      this._showAim = true;
    } else if (playerInput._aimActive && (playerInput.aimX !== 0 || playerInput.aimY !== 0)) {
      this._aimAngle = Math.atan2(playerInput.aimY, playerInput.aimX);
      this._showAim  = true;
    } else {
      this._showAim = false;
      // Mantém o último ângulo de tiro — não rastreia o inimigo passivamente
    }

    // Reload timer — bloqueia disparo mas não atualização de mira
    if (this._reloadTimer > 0) {
      this._reloadTimer -= dt;
      // Toca o som de recarga quando a barra chega na metade
      if (!this._reloadSoundPlayed && this._reloadTimer <= this._reload * 0.5) {
        this._reloadSoundPlayed = true;
        SFX.play('playerReload', 0.9);
      }
      return;
    }
    if (this._shotsLeft <= 0) this._shotsLeft = this._burst;
    if (this._shotTimer > 0)  { this._shotTimer -= dt; return; }

    // Stun (freeze) bloqueia disparo mas não mira
    if (this.freezeTimer > 0) return;

    let ax = 0, ay = 0, shouldFire = false;

    // shootTap sempre processado primeiro (não bloqueado por _aimActive)
    if (playerInput.shootTap) {
      playerInput.shootTap = false;
      playerInput._burstAx = 0; playerInput._burstAy = 1;
      if (other && other.alive) {
        const dx = other.x - this.x, dy = other.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        playerInput._burstAx = dx/len; playerInput._burstAy = dy/len;
      }
      playerInput._burstLeft = this._burst;
    }

    // Burst (mouse click / autofire) tem prioridade sobre setinhas
    if (playerInput._burstLeft > 0) {
      ax = playerInput._burstAx; ay = playerInput._burstAy; shouldFire = true;
    } else if (playerInput._arrowAiming && (playerInput.aimX !== 0 || playerInput.aimY !== 0)) {
      // Setinhas com componente horizontal → dispara na direção apontada
      ax = playerInput.aimX; ay = playerInput.aimY; shouldFire = true;
    }

    if (shouldFire) {
      // Calcula a ponta do cano (mesmo offset usado no draw)
      const _gH = 44;
      const _gW = imgOk(PLAYER_GUN_IMG)
        ? _gH * (PLAYER_GUN_IMG.naturalWidth / PLAYER_GUN_IMG.naturalHeight)
        : 76;
      const _edgeDist = this.sz / 2 + 6;
      const _gunTip   = _edgeDist + _gW;
      const spawnX = this.x + Math.cos(ax !== 0 || ay !== 0 ? Math.atan2(ay, ax) : this._aimAngle) * _gunTip;
      const spawnY = this.y + Math.sin(ax !== 0 || ay !== 0 ? Math.atan2(ay, ax) : this._aimAngle) * _gunTip;
      const p = new Proj(spawnX, spawnY, ax * this._projSpd, ay * this._projSpd, this);
      p.dmg = this._projDmg; p._projSz = this._projSzVal; p._hitboxSz = this._projHbVal;
      projs.push(p);
      SFX.playPitched('playerShoot', -1.5, 1.5, 0.75);
      this._idleTimer  = 0;
      this._regenAccum = 0;
      this._shotTimer  = this._shotDly;
      this._shotsLeft -= 1;
      if (playerInput._burstLeft > 0) playerInput._burstLeft--;
      if (this._shotsLeft <= 0) {
        this._reloadTimer = this._reload;
        this._reloadSoundPlayed = false;
        playerInput._burstLeft = 0;
      }
    }
  }

  draw(c) {
    if (!this.alive) { this._drawLabels(c); return; }
    const sz = this.sz;
    const edgeDist = sz / 2 + 6; // borda do cubo + folga para não sobrepor

    // ── Pistola apontando para a mira — posicionada fora do cubo ──
    // Dimensões respeitando aspect ratio da imagem
    const gH = 44;
    const gW = imgOk(PLAYER_GUN_IMG)
      ? gH * (PLAYER_GUN_IMG.naturalWidth / PLAYER_GUN_IMG.naturalHeight)
      : 76;
    const gunTip = edgeDist + gW; // ponta do cano

    if (imgOk(PLAYER_GUN_IMG)) {
      const gx = this.x + Math.cos(this._aimAngle) * edgeDist;
      const gy = this.y + Math.sin(this._aimAngle) * edgeDist;
      c.save();
      c.translate(gx, gy);
      c.rotate(this._aimAngle);
      if (Math.abs(this._aimAngle) > Math.PI / 2) c.scale(1, -1);
      c.drawImage(PLAYER_GUN_IMG, 0, -gH / 2, gW, gH);
      c.restore();
    }

    // Traço de mira — começa na ponta do cano, 20px espessura
    if (this._showAim) {
      const lineLen     = 420;
      const isReloading = this._reloadTimer > 0;
      c.save();
      c.translate(this.x + Math.cos(this._aimAngle) * gunTip,
                  this.y + Math.sin(this._aimAngle) * gunTip);
      c.rotate(this._aimAngle);
      c.fillStyle = isReloading ? 'rgba(255,60,60,0.82)' : 'rgba(255,255,255,0.82)';
      c.fillRect(0, -10, lineLen, 20);
      c.restore();
    }
    c.save(); c.translate(this.x, this.y);
    // Quadrado
    c.shadowColor = '#7B68EE'; c.shadowBlur = this.hitFlash > 0 ? 0 : 14;
    c.fillStyle   = this.hitFlash > 0 ? 'white' : '#5B2D8E';
    c.strokeStyle = this.hitFlash > 0 ? '#5B2D8E' : '#C39BD3';
    c.lineWidth = 3;
    c.fillRect(-sz/2, -sz/2, sz, sz);
    c.strokeRect(-sz/2, -sz/2, sz, sz);
    // Círculo no centro
    c.shadowBlur = 0;
    c.fillStyle = this.hitFlash > 0 ? '#5B2D8E' : '#C39BD3';
    c.beginPath(); c.arc(0, 0, sz * 0.22, 0, Math.PI*2); c.fill();
    c.restore();
    if (this.freezeTimer > 0) {
      c.save(); c.globalAlpha = 0.4; c.fillStyle = '#A0DFFF';
      c.beginPath(); c.arc(this.x, this.y, sz/2, 0, Math.PI*2); c.fill(); c.restore();
    }
    this._drawLabels(c);
  }

  drawHUD(c, camRef) {
    super.drawHUD(c, camRef);
    if (!this.alive) return;
    const cw = canvas.width/DPR, ch = canvas.height/DPR;
    const sx = cw/2 + (this.x - camRef.x)*camRef.zoom;
    const sy = ch/2 + (this.y - camRef.y)*camRef.zoom;
    const topY = sy - (this.sz/2)*camRef.zoom;
    // Barra de munição — fica logo abaixo da barra de HP
    // (HP bar está em topY - barH - 6, altura 16px → base em topY - 6)
    const ammoY = topY - 3;
    const bw = 72, bh = 8;
    const bx = sx - bw/2;
    c.save();
    if (this._reloadTimer > 0) {
      // Recarga: barra única enchendo
      const prog = 1 - this._reloadTimer / this._reload;
      c.fillStyle = 'rgba(0,0,0,0.55)';
      rrect(c, bx, ammoY, bw, bh, bh/2); c.fill();
      c.save(); rrect(c, bx, ammoY, bw, bh, bh/2); c.clip();
      const grad = c.createLinearGradient(bx, 0, bx+bw, 0);
      grad.addColorStop(0, '#FFE066'); grad.addColorStop(1, '#FFB300');
      c.fillStyle = grad; c.fillRect(bx, ammoY, bw*prog, bh);
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.5;
      rrect(c, bx, ammoY, bw, bh, bh/2); c.stroke();
    }
    c.restore();
  }
}

// ── PLAYER CUSTOM CHARACTER ───────────────────────────────────
const PLAYER_DEFAULTS = {
  name:'Você (custom)', color:'#5B2D8E',
  hp:1000, shots:4, projDmg:30, shotInterval:0.12, projHeal:0,
  reloadCooldown:1.5, projSpeed:580, spread:0, projSize:10, projHitbox:10,
  passiveRegenIdle:5, passiveRegenHPS:100,
  moveSpeedMode:'custom', moveSpeedCustom:200,
  collisionEnabled:false, collisionDamage:10, collisionInterval:0.5,
  stunPerProj:0, stunAllProjs:0,
  homing:false, homingMode:'predict', bouncy:false,
  charSize:65, charHitbox:65, imgRatioX:100, imgRatioY:100,
  weaponSize:44,
  charImg:null, hurtImg:null, weaponImg:null, shotImgs:[], _shotImgNames:[],
  sfxEnabled:false, sfxShootOne:'', sfxShootAll:'', sfxDamage:'', sfxRandom:'', sfxRandomProb:10,
  musicEnabled:false, musicFilename:'', musicLoop:true,
  conditionEnabled:false, conditionHP:300,
};

class PlayerCustomCharacter extends PlayerCharacter {
  constructor(x, y, type) {
    super(x, y, type);
    const c = type.cfg || {};
    this._pcfg = c;
    this.hp = c.hp ?? PLAYER_HP; this.maxHp = this.hp;
    this.sz = c.charSize || PLAYER_SZ;
    this._burst    = c.shots         ?? PLAYER_BURST;
    this._shotDly  = c.shotInterval  ?? PLAYER_SHOT_DLY;
    this._reload   = c.reloadCooldown?? PLAYER_RELOAD;
    this._projSpd  = c.projSpeed     ?? PLAYER_PROJ_SPD;
    this._projDmg  = c.projDmg       ?? PLAYER_DMG;
    this._projSzVal= c.projSize      ?? 10;
    this._projHbVal= c.projHitbox    ?? 10;
    const m = c.moveSpeedMode || 'normal';
    this._spd = m==='custom'?(c.moveSpeedCustom||165):m==='slow'?100:m==='fast'?300:PLAYER_SPD;
    this._shotsLeft = this._burst;
    // Regen passiva — usa config se definido, senão padrão (5s / 100 HPS)
    this._regenIdle = c.passiveRegenIdle ?? 5.0;
    this._regenHPS  = c.passiveRegenHPS  ?? 100;
  }

  // ── Override _shoot: sem disparada (auto-aim tap), com homing/bouncy e projHeal ──
  _shoot(dt, other, projs) {
    const cfg = this._pcfg || {};
    // ── Ready delay ──
    if (this._readyTimer > 0) {
      this._readyTimer -= dt;
      if (playerInput._aimActive && (playerInput.aimX !== 0 || playerInput.aimY !== 0)) {
        this._aimAngle = Math.atan2(playerInput.aimY, playerInput.aimX);
        this._showAim  = true;
      } else { this._showAim = false; }
      playerInput.shootTap = false; // descarta tap acidental no início
      playerInput._burstLeft = 0;
      return;
    }

    // ── Atualiza ângulo de mira ──
    if (!_isMobile && _keys[_pcSettings.autoFireKey] && other && other.alive) {
      // Autofire tem prioridade: aponta e atira no inimigo
      const dx = other.x - this.x, dy = other.y - this.y;
      const len = Math.hypot(dx, dy) || 1;
      playerInput._burstAx = dx / len;
      playerInput._burstAy = dy / len;
      this._aimAngle = Math.atan2(dy, dx);
      this._showAim  = false;
      if (playerInput._burstLeft <= 0) playerInput._burstLeft = this._shotsLeft;
    } else if (playerInput._burstLeft > 0) {
      // Burst em andamento: mantém mira na direção do disparo
      this._aimAngle = Math.atan2(playerInput._burstAy, playerInput._burstAx);
      this._showAim  = false;
    } else if (!_isMobile && _pcSettings.aimMode === 'mouse' && playerInput._mouseAimActive) {
      const dx = playerInput._mouseWorldX - this.x;
      const dy = playerInput._mouseWorldY - this.y;
      if (Math.hypot(dx, dy) > 5) this._aimAngle = Math.atan2(dy, dx);
      this._showAim = true;
    } else if (playerInput._aimActive && (playerInput.aimX !== 0 || playerInput.aimY !== 0)) {
      this._aimAngle = Math.atan2(playerInput.aimY, playerInput.aimX);
      this._showAim  = true;
    } else {
      this._showAim = false;
    }

    // Tap rápido → auto-mira no inimigo (igual ao player padrão)
    if (playerInput.shootTap) {
      playerInput.shootTap = false;
      playerInput._burstAx = 0; playerInput._burstAy = 1;
      if (other && other.alive) {
        const dx = other.x - this.x, dy = other.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        playerInput._burstAx = dx/len; playerInput._burstAy = dy/len;
      }
      playerInput._burstLeft = this._shotsLeft;
    }

    if (this._reloadTimer > 0) {
      this._reloadTimer -= dt;
      if (!this._reloadSoundPlayed && this._reloadTimer <= this._reload * 0.5) {
        this._reloadSoundPlayed = true; SFX.play('playerReload', 0.9);
      }
      return;
    }
    if (this._shotsLeft <= 0) this._shotsLeft = this._burst;
    if (this._shotTimer > 0)  { this._shotTimer -= dt; return; }
    if (this.freezeTimer > 0) return;

    let ax = 0, ay = 0, shouldFire = false;
    if (playerInput._burstLeft > 0) {
      ax = playerInput._burstAx; ay = playerInput._burstAy; shouldFire = true;
    } else if (playerInput._arrowAiming && (playerInput.aimX !== 0 || playerInput.aimY !== 0)) {
      ax = playerInput.aimX; ay = playerInput.aimY; shouldFire = true;
    }

    if (shouldFire) {
      const baseAngle = (ax !== 0 || ay !== 0) ? Math.atan2(ay, ax) : this._aimAngle;
      const spreadRad = (cfg.spread || 0) * (Math.PI / 180) * (Math.random() - 0.5) * 2;
      const aimAngle  = baseAngle + spreadRad;
      const _gH = Math.max(8, Math.min(cfg.weaponSize || 44, CHAR_SZ));
      const _gunImg = (cfg._weaponImgEl && imgOk(cfg._weaponImgEl)) ? cfg._weaponImgEl : PLAYER_GUN_IMG;
      const _gW = imgOk(_gunImg) ? _gH * (_gunImg.naturalWidth / _gunImg.naturalHeight) : _gH*(76/44);
      const _edgeDist = this.sz / 2 + 6;
      const _gunTip   = _edgeDist + _gW;
      const spawnX = this.x + Math.cos(aimAngle) * _gunTip;
      const spawnY = this.y + Math.sin(aimAngle) * _gunTip;
      const vx = Math.cos(aimAngle) * this._projSpd;
      const vy = Math.sin(aimAngle) * this._projSpd;

      // BUG 5: criar tipo de projétil correto (homing / bouncy / normal)
      let p;
      const isHoming = !!cfg.homing;
      const isBouncy = !!cfg.bouncy;
      if (isHoming && isBouncy) p = new BouncyHomingProj(spawnX, spawnY, vx, vy, this, other);
      else if (isHoming)        p = new HomingProj(spawnX, spawnY, vx, vy, this, other);
      else if (isBouncy)        p = new BouncyProj(spawnX, spawnY, vx, vy, this);
      else                      p = new Proj(spawnX, spawnY, vx, vy, this);

      p.dmg       = this._projDmg;
      p._projSz   = this._projSzVal;
      p._hitboxSz = this._projHbVal;
      p.healAmt   = cfg.projHeal || 0;  // BUG 3: cura por tiro
      // Imagem customizada de projétil
      const imgs = cfg._shotImgEls || [];
      if (imgs.length > 0 && imgs[0] && imgOk(imgs[0])) p._customImg = imgs[0];

      projs.push(p);
      SFX.playPitched('playerShoot', -1.5, 1.5, 0.75);
      this._idleTimer  = 0; this._regenAccum = 0;
      this._shotTimer  = this._shotDly;
      this._shotsLeft -= 1;
      if (playerInput._burstLeft > 0) playerInput._burstLeft--;
      if (this._shotsLeft <= 0) {
        this._reloadTimer = this._reload;
        this._reloadSoundPlayed = false;
        playerInput._burstLeft = 0;
      }
    }
  }

  draw(c) {
    if (!this.alive) { this._drawLabels(c); return; }
    const sz = this.sz;
    const edgeDist = sz/2+6;
    const cfg = this._pcfg;
    const gH = Math.max(8, Math.min((cfg && cfg.weaponSize) || 44, CHAR_SZ));
    const _gunImg = (cfg && cfg._weaponImgEl && imgOk(cfg._weaponImgEl))
      ? cfg._weaponImgEl : PLAYER_GUN_IMG;
    const gW = imgOk(_gunImg) ? gH*(_gunImg.naturalWidth/_gunImg.naturalHeight) : gH*(76/44);
    const gunTip = edgeDist+gW;
    // Pistola
    if (imgOk(_gunImg)) {
      const gx = this.x+Math.cos(this._aimAngle)*edgeDist;
      const gy = this.y+Math.sin(this._aimAngle)*edgeDist;
      c.save(); c.translate(gx,gy); c.rotate(this._aimAngle);
      if (Math.abs(this._aimAngle)>Math.PI/2) c.scale(1,-1);
      c.drawImage(_gunImg,0,-gH/2,gW,gH); c.restore();
    }
    // Traço de mira
    if (this._showAim) {
      const isReloading = this._reloadTimer>0;
      c.save();
      c.translate(this.x+Math.cos(this._aimAngle)*gunTip, this.y+Math.sin(this._aimAngle)*gunTip);
      c.rotate(this._aimAngle);
      c.fillStyle = isReloading?'rgba(255,60,60,0.82)':'rgba(255,255,255,0.82)';
      c.fillRect(0,-10,420,20); c.restore();
    }
    // Corpo: imagem custom ou quadrado padrão
    const hasImg = cfg && cfg._charImgEl && imgOk(cfg._charImgEl);
    c.save(); c.translate(this.x, this.y);
    if (hasImg) {
      const useHurt = this.hitFlash>0 && cfg._hurtImgEl && imgOk(cfg._hurtImgEl);
      const img = useHurt ? cfg._hurtImgEl : cfg._charImgEl;
      const rX = (cfg.imgRatioX||100)/100, rY = (cfg.imgRatioY||100)/100;
      c.drawImage(img, -sz/2*rX, -sz/2*rY, sz*rX, sz*rY);
      // Flash branco quando não tem hurt image — usa getWhite como os outros personagens
      if (this.hitFlash>0 && !useHurt) {
        const wt = getWhite(img); if (wt) c.drawImage(wt, -sz/2*rX, -sz/2*rY, sz*rX, sz*rY);
      }
    } else {
      c.shadowColor='#7B68EE'; c.shadowBlur=this.hitFlash>0?0:14;
      c.fillStyle=this.hitFlash>0?'white':'#5B2D8E';
      c.strokeStyle=this.hitFlash>0?'#5B2D8E':'#C39BD3'; c.lineWidth=3;
      c.fillRect(-sz/2,-sz/2,sz,sz); c.strokeRect(-sz/2,-sz/2,sz,sz);
      c.shadowBlur=0; c.fillStyle=this.hitFlash>0?'#5B2D8E':'#C39BD3';
      c.beginPath(); c.arc(0,0,sz*0.22,0,Math.PI*2); c.fill();
    }
    c.restore();
    if (this.freezeTimer>0) {
      const _fRx = (cfg && cfg.imgRatioX||100)/100, _fRy = (cfg && cfg.imgRatioY||100)/100;
      c.save(); c.globalAlpha=0.4; c.fillStyle='#A0DFFF';
      c.fillRect(this.x-sz/2*_fRx, this.y-sz/2*_fRy, sz*_fRx, sz*_fRy);
      c.restore();
    }
    this._drawLabels(c);
  }
}

