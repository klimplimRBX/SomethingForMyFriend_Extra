// ── PLAYER INPUT SYSTEM ────────────────────────────────────────
// Teclado (PC)
const _keys = {};
window.addEventListener('keydown', e => {
  // Captura de rebind — intercepta qualquer tecla (exceto modificadores puros)
  if (_settingsUI.rebinding) {
    // Só bloqueia Alt e Meta (causam atalhos do browser); Shift/Ctrl/CapsLock são permitidos
    if (!['Alt','Meta'].includes(e.key)) {
      _pcSettings.autoFireKey = e.code;
      _settingsUI.rebinding   = false;
      _savePCSettings();
      e.preventDefault();
    }
    return;
  }
  _keys[e.code] = true;
  const moveCodes = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  if (moveCodes.includes(e.code) && G.state === 'playing') e.preventDefault(); // FIX: só bloqueia em jogo
  // Tecla de auto-fire (PC only, durante o jogo)
  if (!_isMobile && e.code === _pcSettings.autoFireKey && _playerActive() && G.state === 'playing') {
    playerInput.shootTap = true;
    e.preventDefault();
  }
  // Fecha painel de settings com Escape
  if (e.code === 'Escape' && _settingsUI.open) {
    _settingsUI.open = false;
    _settingsUI.rebinding = false;
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => { _keys[e.code] = false; });

function _updateKeyboard() {
  const player = G.chars && G.chars.find(c => c instanceof PlayerCharacter);
  if (!player) return;
  // WASD → movimento
  playerInput.moveX = ((_keys['KeyD'])?1:0) - ((_keys['KeyA'])?1:0);
  playerInput.moveY = ((_keys['KeyS'])?1:0)  - ((_keys['KeyW'])?1:0);
  // Setinhas → twin-stick aim/shoot (e movimento só quando WASD não está ativo)
  const ax = ((_keys['ArrowRight'])?1:0) - ((_keys['ArrowLeft'])?1:0);
  const ay = ((_keys['ArrowDown'])?1:0)  - ((_keys['ArrowUp'])?1:0);
  const wasdActive = _keys['KeyW'] || _keys['KeyA'] || _keys['KeyS'] || _keys['KeyD'];
  if (ax !== 0 || ay !== 0) {
    if (!wasdActive) {
      // Modo single-stick: setinhas controlam movimento e mira
      if (ax !== 0) playerInput.moveX = ax;
      if (ay !== 0) playerInput.moveY = ay;
    } else {
      // FIX MOVIMENTO: WASD + setinhas → somam para diagonal (ex: W + → = cima-direita)
      if (ax !== 0) playerInput.moveX = clamp(playerInput.moveX + ax, -1, 1);
      if (ay !== 0) playerInput.moveY = clamp(playerInput.moveY + ay, -1, 1);
    }
    const len = Math.hypot(ax, ay) || 1;
    playerInput.aimX = ax / len;
    playerInput.aimY = ay / len;
    playerInput._aimActive = true;
    // Só dispara se houver componente horizontal (↑↓ puros não atiram)
    playerInput._arrowAiming = ax !== 0;
  } else {
    // Só limpa o aim se nenhum joystick estiver ativo no momento
    if (!_joy.mouse.down && !_joy.aim.active) {
      playerInput.aimX = 0;
      playerInput.aimY = 0;
      playerInput._aimActive = false;
    }
    playerInput._arrowAiming = false;
  }
}

// Joystick state
const _joy = {
  move: { active:false, id:null, bx:0, by:0, cx:0, cy:0 },
  aim:  { active:false, id:null, bx:0, by:0, cx:0, cy:0, t0:0, tapped:false },
  // mouse state para PC
  mouse: { down:false, which:null, bx:0, by:0, cx:0, cy:0, t0:0 },
};
const JOY_R = 52; // raio do joystick em CSS px

function _joyBaseCSS(side) {
  const r = canvas.getBoundingClientRect();
  if (side === 'move') return { x: r.left + r.width*0.18,  y: r.top + r.height*0.83 };
  return              { x: r.left + r.width*0.82,  y: r.top + r.height*0.83 };
}

function _playerActive() {
  return G.chars && G.chars.some(c => c instanceof PlayerCharacter && c.alive);
}

// ── TOUCH EVENTS ─────────────────────────────────────────────
canvas.addEventListener('touchstart', e => {
  if (!_playerActive()) return;
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const midX = r.left + r.width * 0.5;
  const midY = r.top  + r.height * 0.5;
  for (const t of e.changedTouches) {
    const cx = t.clientX, cy = t.clientY;
    // Só ativa joysticks na metade inferior da tela
    if (cy < midY) continue;
    const isLeft = cx < midX;
    if (isLeft && !_joy.move.active) {
      // Move joy nasce onde o dedo tocou
      _joy.move.active=true; _joy.move.id=t.identifier;
      _joy.move.bx=cx; _joy.move.by=cy;
      _joy.move.cx=cx; _joy.move.cy=cy;
    } else if (!isLeft && !_joy.aim.active) {
      // Aim joy nasce onde o dedo tocou
      _joy.aim.active=true; _joy.aim.id=t.identifier;
      _joy.aim.bx=cx; _joy.aim.by=cy;
      _joy.aim.cx=cx; _joy.aim.cy=cy;
      _joy.aim.t0 = performance.now(); _joy.aim.tapped=false;
      playerInput._aimActive = false;
    }
  }
}, { passive:false });

canvas.addEventListener('touchmove', e => {
  if (!_playerActive()) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (_joy.move.active && t.identifier===_joy.move.id) {
      _joy.move.cx=t.clientX; _joy.move.cy=t.clientY;
      // Dinâmico: se ultrapassar o raio, move a base junto
      const mdx = t.clientX - _joy.move.bx, mdy = t.clientY - _joy.move.by;
      const mdist = Math.hypot(mdx, mdy);
      if (mdist > JOY_R) {
        const over = mdist - JOY_R;
        _joy.move.bx += (mdx/mdist)*over;
        _joy.move.by += (mdy/mdist)*over;
      }
    }
    if (_joy.aim.active && t.identifier===_joy.aim.id) {
      _joy.aim.cx=t.clientX; _joy.aim.cy=t.clientY;
      const adx = t.clientX - _joy.aim.bx, ady = t.clientY - _joy.aim.by;
      if (Math.hypot(adx,ady) > 10) playerInput._aimActive = true;
      // Dinâmico: se ultrapassar o raio, move a base junto
      const adist = Math.hypot(adx, ady);
      if (adist > JOY_R) {
        const over = adist - JOY_R;
        _joy.aim.bx += (adx/adist)*over;
        _joy.aim.by += (ady/adist)*over;
      }
    }
  }
}, { passive:false });

canvas.addEventListener('touchend', e => {
  if (!_playerActive()) return;
  for (const t of e.changedTouches) {
    if (_joy.move.active && t.identifier===_joy.move.id) {
      _joy.move.active=false; playerInput.moveX=0; playerInput.moveY=0;
    }
    if (_joy.aim.active && t.identifier===_joy.aim.id) {
      // Tap rápido sem movimento → auto-aim no inimigo
      const held = performance.now() - _joy.aim.t0;
      const dx = t.clientX - _joy.aim.bx, dy = t.clientY - _joy.aim.by;
      const dist = Math.hypot(dx, dy);
      if (held < 220 && dist < 12) {
        playerInput.shootTap = true;
      } else if (playerInput._aimActive && dist >= JOY_R * 0.35) {
        // Soltou após arrastar longe do centro → dispara na direção do joystick
        const len = dist || 1;
        playerInput._burstAx = dx/len;
        playerInput._burstAy = dy/len;
        const _pc = G.chars && G.chars.find(c => c instanceof PlayerCharacter);
        playerInput._burstLeft = _pc ? _pc._shotsLeft : PLAYER_BURST;
      }
      // Se dist < JOY_R * 0.35 e não foi tap → cancela o tiro (zona central)
      _joy.aim.active=false;
      playerInput.aimX=0; playerInput.aimY=0; playerInput._aimActive=false;
    }
  }
}, { passive:false });

// ── MOUSE (PC) ────────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  if (_isMobile || !_playerActive() || G.state !== 'playing') return;

  if (_pcSettings.aimMode === 'mouse') {
    // Modo Mouse: clique em qualquer lugar → atira naquela direção
    const player = G.chars && G.chars.find(c => c instanceof PlayerCharacter && c.alive);
    if (!player) return;
    const r = canvas.getBoundingClientRect();
    const cpx = (e.clientX - r.left) * (canvas.width  / r.width)  / DPR;
    const cpy = (e.clientY - r.top)  * (canvas.height / r.height) / DPR;
    const cw = canvas.width/DPR, ch = canvas.height/DPR;
    const worldX = cam.x + (cpx - cw/2) / cam.zoom;
    const worldY = cam.y + (cpy - ch/2) / cam.zoom;
    const dx = worldX - player.x, dy = worldY - player.y;
    const len = Math.hypot(dx, dy) || 1;
    playerInput._burstAx = dx/len; playerInput._burstAy = dy/len;
    playerInput._burstLeft = player._shotsLeft;
    e.preventDefault();
  } else {
    // Modo Joystick: comportamento original (arrastar o joystick de mira)
    const joyR_css = JOY_R * (_pcSettings.joySize / 100);
    const aimBase = _joyBaseCSS('aim');
    const d = Math.hypot(e.clientX - aimBase.x, e.clientY - aimBase.y);
    if (d < joyR_css * 1.6) {
      _joy.mouse.down=true;
      _joy.mouse.bx=aimBase.x; _joy.mouse.by=aimBase.y;
      _joy.mouse.cx=e.clientX; _joy.mouse.cy=e.clientY;
      _joy.mouse.t0=performance.now(); playerInput._aimActive=false;
      e.preventDefault();
    }
  }
});
window.addEventListener('mousemove', e => {
  // Slider drag do joystick size
  if (_settingsUI._draggingSlider) {
    const t = _settingsUI._panelBtns && _settingsUI._panelBtns.joySizeTrack;
    if (t) {
      const pct = Math.max(0, Math.min(1, (e.clientX - t.x) / t.w));
      _pcSettings.joySize = Math.round(50 + pct * 450);
      _savePCSettings();
    }
    return;
  }
  // Joystick mode drag update
  if (!_joy.mouse.down) return;
  _joy.mouse.cx=e.clientX; _joy.mouse.cy=e.clientY;
  const dx = e.clientX - _joy.mouse.bx, dy = e.clientY - _joy.mouse.by;
  if (Math.hypot(dx,dy) > 10) playerInput._aimActive = true;
});
window.addEventListener('mouseup', e => {
  // Solta slider
  if (_settingsUI._draggingSlider) {
    _settingsUI._draggingSlider = false;
    return;
  }
  if (!_joy.mouse.down) return;
  const held = performance.now() - _joy.mouse.t0;
  const dx = _joy.mouse.cx - _joy.mouse.bx, dy = _joy.mouse.cy - _joy.mouse.by;
  const dist = Math.hypot(dx, dy);
  const joyR_css = JOY_R * (_pcSettings.joySize / 100);
  if (held < 220 && dist < 12) {
    playerInput.shootTap = true;
  } else if (playerInput._aimActive && dist >= joyR_css * 0.35) {
    const len = dist || 1;
    playerInput._burstAx = dx/len; playerInput._burstAy = dy/len;
    const _pc2 = G.chars && G.chars.find(c => c instanceof PlayerCharacter);
    playerInput._burstLeft = _pc2 ? _pc2._shotsLeft : PLAYER_BURST;
  }
  _joy.mouse.down=false;
  playerInput.aimX=0; playerInput.aimY=0; playerInput._aimActive=false;
});

// ── ATUALIZA playerInput a cada frame ─────────────────────────
function _updatePlayerInput() {
  if (!_playerActive()) return;
  // Movimento: touch OU teclado
  const isTouchMove = _joy.move.active;
  if (isTouchMove) {
    let dx = _joy.move.cx - _joy.move.bx, dy = _joy.move.cy - _joy.move.by;
    const len = Math.hypot(dx,dy);
    const clamped = Math.min(len, JOY_R);
    if (len > 4) { playerInput.moveX = (dx/len)*clamped/JOY_R; playerInput.moveY = (dy/len)*clamped/JOY_R; }
    else { playerInput.moveX=0; playerInput.moveY=0; }
  } else {
    _updateKeyboard();
  }
  // Mira: mouse mode (PC) → calcula posição world do cursor a cada frame
  if (!_isMobile && _pcSettings.aimMode === 'mouse' && _mousePos.inCanvas) {
    const r = canvas.getBoundingClientRect();
    const cpx = (_mousePos.x - r.left) * (canvas.width  / r.width)  / DPR;
    const cpy = (_mousePos.y - r.top)  * (canvas.height / r.height) / DPR;
    const cw = canvas.width/DPR, ch = canvas.height/DPR;
    playerInput._mouseWorldX = cam.x + (cpx - cw/2) / cam.zoom;
    playerInput._mouseWorldY = cam.y + (cpy - ch/2) / cam.zoom;
    playerInput._mouseAimActive = true;
  } else {
    playerInput._mouseAimActive = false;
    // Touch ou joystick mode: atualiza aimX/Y pelo joystick
    const aimSrc = _joy.aim.active ? _joy.aim : (_joy.mouse.down ? _joy.mouse : null);
    if (aimSrc && playerInput._aimActive) {
      let dx = aimSrc.cx - aimSrc.bx, dy = aimSrc.cy - aimSrc.by;
      const len = Math.hypot(dx,dy) || 1;
      playerInput.aimX = dx/len; playerInput.aimY = dy/len;
    } else if (!playerInput._aimActive) {
      playerInput.aimX=0; playerInput.aimY=0;
    }
  }
}

// ── HELPER: Desenha uma tecla de teclado ──────────────────────
function _drawKey(c, cx, cy, label, pressed, KS) {
  const KR = 6;
  c.save();
  // Sombra
  c.globalAlpha = 0.5;
  c.fillStyle = pressed ? 'rgba(60,140,255,0.5)' : 'rgba(0,0,0,0.5)';
  rrect(c, cx-KS/2+2, cy-KS/2+3, KS, KS, KR); c.fill();
  // Corpo
  c.globalAlpha = pressed ? 0.97 : 0.72;
  c.fillStyle = pressed ? 'rgba(74,158,255,0.95)' : 'rgba(22,25,48,0.88)';
  rrect(c, cx-KS/2, cy-KS/2, KS, KS, KR); c.fill();
  // Borda
  c.strokeStyle = pressed ? 'rgba(130,200,255,1)' : 'rgba(80,100,160,0.7)';
  c.lineWidth = pressed ? 2.5 : 1.5;
  rrect(c, cx-KS/2, cy-KS/2, KS, KS, KR); c.stroke();
  // Label
  c.globalAlpha = 1;
  c.fillStyle = pressed ? 'white' : 'rgba(160,185,235,0.9)';
  c.font = `bold ${KS*0.40}px Arial`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = pressed ? 'rgba(74,158,255,0.8)' : 'transparent';
  c.shadowBlur  = pressed ? 8 : 0;
  c.fillText(label, cx, cy+1);
  c.restore();
}

// ── HELPER: HUD de teclado WASD + setinhas (PC) ───────────────
function _drawKeyboardHUD(c, cw, ch) {
  const KS = 34; // tamanho da tecla em px lógicos
  const KG = 5;  // gap entre teclas

  const wW = _keys['KeyW'], wA = _keys['KeyA'], wS = _keys['KeyS'], wD = _keys['KeyD'];
  const aU = _keys['ArrowUp'], aL = _keys['ArrowLeft'], aD = _keys['ArrowDown'], aR = _keys['ArrowRight'];
  const showArrows = aU || aL || aD || aR;

  // Centro do bloco WASD
  const wasdCX  = showArrows ? cw*0.19 + (KS+KG)*3.5 : cw*0.19;
  const keysRow2 = ch*0.88;          // linha de baixo (A S D / ← ↓ →)
  const keysRow1 = keysRow2 - KS - KG; // linha de cima  (W / ↑)

  if (showArrows) {
    const arrCX = wasdCX - (KS+KG)*3.5;
    _drawKey(c, arrCX,          keysRow1, '↑', aU, KS);
    _drawKey(c, arrCX-(KS+KG),  keysRow2, '←', aL, KS);
    _drawKey(c, arrCX,          keysRow2, '↓', aD, KS);
    _drawKey(c, arrCX+(KS+KG),  keysRow2, '→', aR, KS);
    // Divisória sutil entre blocos
    c.save(); c.globalAlpha=0.25;
    c.strokeStyle='rgba(74,158,255,0.6)'; c.lineWidth=1.5;
    c.setLineDash([3,4]);
    const divX = arrCX + (KS+KG)*1.5 + KS/2 + 2;
    c.beginPath(); c.moveTo(divX, keysRow1-KS/2-4); c.lineTo(divX, keysRow2+KS/2+4); c.stroke();
    c.restore();
  }

  _drawKey(c, wasdCX,          keysRow1, 'W', wW, KS);
  _drawKey(c, wasdCX-(KS+KG),  keysRow2, 'A', wA, KS);
  _drawKey(c, wasdCX,          keysRow2, 'S', wS, KS);
  _drawKey(c, wasdCX+(KS+KG),  keysRow2, 'D', wD, KS);
}

// ── HELPER: Ícone de engrenagem de settings ───────────────────
function _drawSettingsGear(c, cw) {
  const gx = cw - 28, gy = 28, gr = 16;
  _settingsUI._gearBtn = { x:gx, y:gy, r:gr };
  c.save();
  c.globalAlpha = _settingsUI.open ? 1.0 : 0.70;
  c.fillStyle   = _settingsUI.open ? '#4A9EFF' : 'rgba(20,24,52,0.88)';
  c.beginPath(); c.arc(gx, gy, gr, 0, Math.PI*2); c.fill();
  c.strokeStyle = _settingsUI.open ? 'rgba(180,220,255,1)' : 'rgba(80,110,180,0.8)';
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(gx, gy, gr, 0, Math.PI*2); c.stroke();
  c.fillStyle = _settingsUI.open ? 'white' : 'rgba(180,200,240,0.9)';
  c.font = `${gr+2}px Arial`; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('⚙', gx, gy+1);
  c.restore();
}

// ── HELPER: Converte código de tecla para label legível ───────
function _keyCodeLabel(code) {
  const map = {
    'Space':'Espaço', 'Enter':'Enter', 'Escape':'Esc',
    'ShiftLeft':'Shift ←', 'ShiftRight':'Shift →',
    'ControlLeft':'Ctrl ←', 'ControlRight':'Ctrl →',
    'AltLeft':'Alt ←', 'AltRight':'Alt →',
    'Tab':'Tab', 'Backspace':'Backspace',
    'CapsLock':'Caps', 'Delete':'Del',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key'))    return code.slice(3);
  if (code.startsWith('Digit'))  return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num'+code.slice(6);
  if (/^F\d+$/.test(code))       return code;
  if (code.startsWith('Arrow'))  return {ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'}[code] || code;
  return code.slice(0, 7);
}

// ── HELPER: Painel de configurações (PC) ─────────────────────
function _drawSettingsPanel(c, cw, ch) {
  const PW   = Math.min(295, cw * 0.78);
  const px   = cw - PW - 8;
  const py   = 52;
  const LH   = 46; // line height por item
  const B    = _settingsUI._panelBtns = {};

  // Conta itens para calcular altura
  const rowCount = 4 + (_pcSettings.aimMode === 'joystick' ? 1 : 0);
  const PH = 16 + rowCount * LH + 6;

  // Fundo do painel
  c.save();
  c.globalAlpha = 0.98;
  c.fillStyle = 'rgba(10,13,38,0.97)';
  rrect(c, px, py, PW, PH, 12); c.fill();
  c.strokeStyle = 'rgba(74,158,255,0.55)'; c.lineWidth = 1.5;
  rrect(c, px, py, PW, PH, 12); c.stroke();
  c.globalAlpha = 1;

  let row = py + 14;

  // Título
  c.fillStyle='rgba(160,190,255,0.9)'; c.font='bold 12px Arial';
  c.textAlign='left'; c.textBaseline='top';
  c.fillText('⚙  Configurações — PC', px+12, row+2);
  row += LH * 0.65;
  // Separador
  c.save(); c.strokeStyle='rgba(74,158,255,0.28)'; c.lineWidth=1;
  c.beginPath(); c.moveTo(px+8,row); c.lineTo(px+PW-8,row); c.stroke(); c.restore();
  row += LH * 0.45;

  // ── Modo de movimento (fixo) ──────────────────────────────
  c.fillStyle='rgba(100,120,180,0.8)'; c.font='10px Arial';
  c.fillText('Modo de movimento  (PC only)', px+12, row);
  c.fillStyle='rgba(200,215,255,0.95)'; c.font='bold 12px Arial';
  c.fillText('WASD / ↑↓←→ mover  •  Mouse mirar', px+12, row+14);
  row += LH;

  // ── Keybind de auto-fire ──────────────────────────────────
  c.fillStyle='rgba(100,120,180,0.8)'; c.font='10px Arial';
  c.textBaseline='top';
  c.fillText('Keybind de auto-fire', px+12, row);
  const kbW=94, kbH=24, kbx=px+PW-kbW-12, kby=row+12;
  const rebinding = _settingsUI.rebinding;
  c.fillStyle = rebinding ? 'rgba(255,200,40,0.2)' : 'rgba(20,28,65,0.85)';
  rrect(c, kbx, kby, kbW, kbH, 6); c.fill();
  c.strokeStyle = rebinding ? '#FFD700' : 'rgba(74,158,255,0.5)'; c.lineWidth=1.5;
  rrect(c, kbx, kby, kbW, kbH, 6); c.stroke();
  c.fillStyle = rebinding ? '#FFD700' : 'rgba(220,235,255,0.95)';
  c.font = rebinding ? 'bold 11px Arial' : 'bold 11px Arial';
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText(rebinding ? 'Pressione...' : _keyCodeLabel(_pcSettings.autoFireKey), kbx+kbW/2, kby+kbH/2);
  c.textAlign='left'; c.textBaseline='top';
  B.keybind = { x:kbx, y:kby, w:kbW, h:kbH };
  row += LH;

  // ── Modo de tiro ──────────────────────────────────────────
  c.fillStyle='rgba(100,120,180,0.8)'; c.font='10px Arial';
  c.fillText('Modo de tiro', px+12, row);
  const btnH=24, btnY=row+12;
  const mBW=82, jBW=96;
  const mouseBtn = { x:px+12,          y:btnY, w:mBW, h:btnH };
  const joyBtn   = { x:px+12+mBW+6,    y:btnY, w:jBW, h:btnH };

  // Botão Mouse
  const mActive = _pcSettings.aimMode==='mouse';
  c.fillStyle = mActive ? 'rgba(74,158,255,0.9)' : 'rgba(22,30,65,0.7)';
  rrect(c, mouseBtn.x, mouseBtn.y, mouseBtn.w, mouseBtn.h, 5); c.fill();
  c.strokeStyle = mActive ? 'rgba(130,200,255,1)' : 'rgba(74,158,255,0.35)'; c.lineWidth=1.5;
  rrect(c, mouseBtn.x, mouseBtn.y, mouseBtn.w, mouseBtn.h, 5); c.stroke();
  c.fillStyle='white'; c.font=`bold 11px Arial`; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('🖱️ Mouse', mouseBtn.x+mouseBtn.w/2, mouseBtn.y+mouseBtn.h/2);

  // Botão Joystick
  const jActive = _pcSettings.aimMode==='joystick';
  c.fillStyle = jActive ? 'rgba(220,90,90,0.85)' : 'rgba(22,30,65,0.7)';
  rrect(c, joyBtn.x, joyBtn.y, joyBtn.w, joyBtn.h, 5); c.fill();
  c.strokeStyle = jActive ? 'rgba(255,140,140,1)' : 'rgba(74,158,255,0.35)'; c.lineWidth=1.5;
  rrect(c, joyBtn.x, joyBtn.y, joyBtn.w, joyBtn.h, 5); c.stroke();
  c.fillStyle='white'; c.font='bold 10px Arial'; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('Joystick ⚠', joyBtn.x+joyBtn.w/2, joyBtn.y+joyBtn.h/2);

  c.textAlign='left'; c.textBaseline='top';
  B.aimMouse = mouseBtn; B.aimJoy = joyBtn;
  row += LH;

  // ── Tamanho do joystick (só aparece em modo joystick) ─────
  if (_pcSettings.aimMode === 'joystick') {
    c.fillStyle='rgba(100,120,180,0.8)'; c.font='10px Arial';
    c.fillText(`Tamanho do joystick de mira: ${_pcSettings.joySize}%`, px+12, row);
    const sbH=24, sbW=28, sby=row+12;
    const minBtn = { x:px+12,               y:sby, w:sbW, h:sbH };
    const maxBtn = { x:px+12+sbW+50+6,      y:sby, w:sbW, h:sbH };
    // Track
    const tkX=px+12+sbW+4, tkW=50, tkY=sby+sbH/2;
    c.fillStyle='rgba(20,28,65,0.8)'; c.fillRect(tkX, tkY-4, tkW, 8);
    const pct = Math.max(0, Math.min(1, (_pcSettings.joySize-100)/400));
    c.fillStyle='#4A9EFF'; c.fillRect(tkX, tkY-4, tkW*pct, 8);
    // Círculo do thumb
    c.fillStyle='white'; c.beginPath(); c.arc(tkX+tkW*pct, tkY, 6, 0, Math.PI*2); c.fill();
    // Botões -/+
    [minBtn, maxBtn].forEach((btn, i) => {
      c.fillStyle='rgba(30,40,85,0.85)';
      rrect(c, btn.x, btn.y, btn.w, btn.h, 4); c.fill();
      c.strokeStyle='rgba(74,158,255,0.5)'; c.lineWidth=1;
      rrect(c, btn.x, btn.y, btn.w, btn.h, 4); c.stroke();
      c.fillStyle='white'; c.font='bold 15px Arial';
      c.textAlign='center'; c.textBaseline='middle';
      c.fillText(i===0?'−':'+', btn.x+btn.w/2, btn.y+btn.h/2);
    });
    c.textAlign='left'; c.textBaseline='top';
    B.joySizeMinus = minBtn; B.joySizePlus = maxBtn;
    B.joySizeTrack = { x:tkX, y:tkY-6, w:tkW, h:12 }; // área clicável do slider
    row += LH;
  }

  _settingsUI._panelRect = { x:px, y:py, w:PW, h:PH };
  c.restore();
}

// ── HELPER: Detecta cliques no painel de settings ─────────────
function _handleSettingsClick(cssX, cssY) {
  const g = _settingsUI._gearBtn;
  if (g && Math.hypot(cssX-g.x, cssY-g.y) <= g.r*1.25) {
    _settingsUI.open      = !_settingsUI.open;
    _settingsUI.rebinding = false;
    return true;
  }
  if (!_settingsUI.open) return false;

  const B = _settingsUI._panelBtns;
  function hit(b) { return b && cssX>=b.x && cssX<=b.x+b.w && cssY>=b.y && cssY<=b.y+b.h; }

  if (hit(B.keybind)) {
    _settingsUI.rebinding = !_settingsUI.rebinding;
    return true;
  }
  if (hit(B.aimMouse)) {
    _pcSettings.aimMode='mouse'; _savePCSettings();
    // Cancela joystick mouse se estava activo
    _joy.mouse.down=false; playerInput._aimActive=false;
    return true;
  }
  if (hit(B.aimJoy)) {
    _pcSettings.aimMode='joystick'; _savePCSettings();
    return true;
  }
  if (hit(B.joySizeMinus)) {
    _pcSettings.joySize = Math.max(50, _pcSettings.joySize - 25);
    _savePCSettings(); return true;
  }
  if (hit(B.joySizePlus)) {
    _pcSettings.joySize = Math.min(500, _pcSettings.joySize + 25);
    _savePCSettings(); return true;
  }
  // Slider de tamanho do joystick
  if (B.joySizeTrack) {
    const t = B.joySizeTrack;
    if (cssX >= t.x - 8 && cssX <= t.x + t.w + 8 && cssY >= t.y - 4 && cssY <= t.y + t.h + 4) {
      const pct = Math.max(0, Math.min(1, (cssX - t.x) / t.w));
      _pcSettings.joySize = Math.round(50 + pct * 450);
      _savePCSettings();
      _settingsUI._draggingSlider = true;
      return true;
    }
  }
  // Clique dentro do painel mas sem botão → consome sem propagar
  const pr = _settingsUI._panelRect;
  if (pr && cssX>=pr.x && cssX<=pr.x+pr.w && cssY>=pr.y && cssY<=pr.y+pr.h) return true;
  // Clique fora → fecha
  _settingsUI.open=false; _settingsUI.rebinding=false;
  return false;
}

// ── DESENHA CONTROLES HUD ─────────────────────────────────────
function _drawJoysticks(c) {
  if (!_playerActive()) return;
  const r   = canvas.getBoundingClientRect();
  const scx = canvas.width  / r.width;
  const scy = canvas.height / r.height;
  const cw  = canvas.width/DPR, ch = canvas.height/DPR;

  function cssToCanvas(cx, cy) {
    return { x:(cx-r.left)*scx/DPR, y:(cy-r.top)*scy/DPR };
  }
  const JR = JOY_R * scx / DPR;

  function drawJoyCanvas(baseCX, baseCY, stickCX, stickCY, color, JR_ov) {
    const JR2  = JR_ov !== undefined ? JR_ov : JR;
    const base  = cssToCanvas(baseCX, baseCY);
    const stick = cssToCanvas(stickCX, stickCY);
    let dx = stick.x-base.x, dy = stick.y-base.y;
    const len = Math.hypot(dx,dy);
    const cl  = Math.min(len, JR2);
    const nx = len>2?dx/len:0, ny = len>2?dy/len:0;
    const kx = base.x+nx*cl, ky = base.y+ny*cl;
    c.save();
    c.globalAlpha=0.45; c.fillStyle='rgba(0,0,0,0.35)';
    c.beginPath(); c.arc(base.x,base.y,JR2,0,Math.PI*2); c.fill();
    c.globalAlpha=0.7; c.strokeStyle='rgba(255,255,255,0.75)'; c.lineWidth=2.5;
    c.beginPath(); c.arc(base.x,base.y,JR2,0,Math.PI*2); c.stroke();
    const sr=JR2*0.50;
    c.globalAlpha=0.82; c.fillStyle=color;
    c.beginPath(); c.arc(kx,ky,sr,0,Math.PI*2); c.fill();
    c.strokeStyle='rgba(255,255,255,0.45)'; c.lineWidth=2;
    c.beginPath(); c.arc(kx,ky,sr,0,Math.PI*2); c.stroke();
    c.restore();
  }

  // ── MOBILE: joysticks originais ────────────────────────────
  if (_isMobile) {
    const mb = _joyBaseCSS('move');
    let mbx=mb.x, mby=mb.y, msx=mb.x, msy=mb.y;
    if (_joy.move.active) { mbx=_joy.move.bx; mby=_joy.move.by; msx=_joy.move.cx; msy=_joy.move.cy; }
    else { msx=mb.x+playerInput.moveX*JOY_R*0.75; msy=mb.y+playerInput.moveY*JOY_R*0.75; }
    drawJoyCanvas(mbx, mby, msx, msy, '#4A9EFF');
    const ab = _joyBaseCSS('aim');
    let abx=ab.x, aby=ab.y, asx=ab.x, asy=ab.y;
    if (_joy.aim.active) { abx=_joy.aim.bx; aby=_joy.aim.by; asx=_joy.aim.cx; asy=_joy.aim.cy; }
    drawJoyCanvas(abx, aby, asx, asy, '#FF4444');
    return;
  }

  // ── PC: teclado WASD + opções de mira ──────────────────────
  _drawKeyboardHUD(c, cw, ch);

  if (_pcSettings.aimMode === 'joystick') {
    // Joystick de mira com tamanho configurável
    const joyScale = _pcSettings.joySize / 100;
    const JR_s    = JR * joyScale;
    const joyR_css = JOY_R * joyScale;
    const ab  = _joyBaseCSS('aim');
    let abx=ab.x, aby=ab.y, asx=ab.x, asy=ab.y;
    if (_joy.aim.active)    { abx=_joy.aim.bx; aby=_joy.aim.by; asx=_joy.aim.cx; asy=_joy.aim.cy; }
    else if (_joy.mouse.down) { asx=_joy.mouse.cx; asy=_joy.mouse.cy; }
    drawJoyCanvas(abx, aby, asx, asy, '#FF4444', JR_s);
  } else {
    // Modo Mouse: crosshair na posição do cursor
    if (_mousePos.inCanvas) {
      const mc = cssToCanvas(_mousePos.x, _mousePos.y);
      const cr = 11;
      c.save();
      c.globalAlpha = 0.9;
      c.strokeStyle = '#FF4444'; c.lineWidth = 2;
      // Linhas cruzadas
      c.beginPath(); c.moveTo(mc.x-cr,mc.y); c.lineTo(mc.x-4,mc.y); c.stroke();
      c.beginPath(); c.moveTo(mc.x+4, mc.y); c.lineTo(mc.x+cr,mc.y); c.stroke();
      c.beginPath(); c.moveTo(mc.x,mc.y-cr); c.lineTo(mc.x,mc.y-4); c.stroke();
      c.beginPath(); c.moveTo(mc.x,mc.y+4); c.lineTo(mc.x,mc.y+cr); c.stroke();
      // Círculo central
      c.globalAlpha = 0.75;
      c.beginPath(); c.arc(mc.x,mc.y,4.5,0,Math.PI*2); c.stroke();
      c.restore();
    }
  }

  // Ícone de engrenagem + painel de settings
  _drawSettingsGear(c, cw);
  if (_settingsUI.open) _drawSettingsPanel(c, cw, ch);
}

// Auxiliares de cor para o gradiente do stick
function lightenColor(hex, amt) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+Math.round(255*amt))},${Math.min(255,g+Math.round(255*amt))},${Math.min(255,b+Math.round(255*amt))})`;
}
function darkenColor(hex, amt) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,r-Math.round(255*amt))},${Math.max(0,g-Math.round(255*amt))},${Math.max(0,b-Math.round(255*amt))})`;
}

// ── INPUT ──────────────────────────────────────────────────────
function getXY(e,touch) {
  const r=canvas.getBoundingClientRect();
  const sx=canvas.width/r.width, sy=canvas.height/r.height;
  const s=touch?e.touches[0]:e;
  return {x:(s.clientX-r.left)*sx, y:(s.clientY-r.top)*sy};
}
canvas.addEventListener('click', e=>{
  // Painel de settings (PC only, no menu e durante o jogo)
  if (!_isMobile && (G.state === 'playing' || G.state === 'menu')) {
    if (_handleSettingsClick(e.clientX, e.clientY)) return;
  }
  const p=getXY(e,false); G.tap(p.x,p.y);
});
canvas.addEventListener('touchstart', e=>{
  e.preventDefault();
  // Gameover e menu: sempre propaga pro G.tap
  if (G.state === 'gameover' || G.state === 'menu') {
    const p=getXY(e,true); G.tap(p.x,p.y); return;
  }
  // Durante o jogo: joystick já processou, não passa para G.tap
  if (_playerActive()) return;
  const p=getXY(e,true); G.tap(p.x,p.y);
},{passive:false});

// ── MAIN LOOP ──────────────────────────────────────────────────
let last=0;
function loop(ts) {
  const dt=Math.min((ts-last)/1000,0.05); last=ts;
  _updatePlayerInput();
  G.update(dt); G.draw(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
