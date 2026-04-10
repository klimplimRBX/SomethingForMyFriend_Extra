"use strict";

// ── CONSTANTS ──────────────────────────────────────────────────
// NOTA: AW e AH são `let` — a arena expande na fase 2 do Cachorro Caramelo
let AW        = 475;
let AH        = 475;
const BORDER    = 16;
const CHAR_SZ   = 72;
const CHAR_SPD  = 165;
const PROJ_SPD  = 345;
const TIGER_PROJ_SPD = 500;
const TIGER_BURST_DLY = 0.055;
const DEAL_INTERVAL   = 0.13;  // atraso entre cada carta sendo distribuída
const DEAL_DURATION   = 0.28;  // tempo que cada carta leva para voar até o lugar
const DEAL_TOTAL_T    = (5-1)*DEAL_INTERVAL + DEAL_DURATION; // ~0.80s total
const PROJ_DMG  = 50;
const PROJ_N    = 4;
const BURST_DLY = 0.12;
const CHARGE_T  = 2.0;
const HIT_FLASH = 0.2;
const SLOW_DUR  = 0.25;
const STACK_WIN = 0.50;
const LINGER_T  = 5.0;
const PROJ_SZ   = 14;
const PROJ_COLOR = '#FFD700';

// ── NEYMAR CONSTANTS ───────────────────────────────────────────
const NEYMAR_SPD          = 220;
const NEYMAR_PROJ_SPD     = 480;
const NEYMAR_PROJ_DMG     = 100;
const NEYMAR_PROJ_SZ      = 24;
const NEYMAR_CHARGE_T     = 1.8;
const NEYMAR_SZ           = 100;
const NEYMAR_HIT_FLASH    = 1.0;
const NEYMAR_DRIBBLE_CD   = 4.0;
const NEYMAR_DRIBBLE_DUR  = 3.0;
const NEYMAR_DRIBBLE_SPD  = 320;

// ── BAIANO CONSTANTS ───────────────────────────────────────────
const BAIANO_SZ          = 80;
const BAIANO_IMG_W       = 120; // comprimido dos lados
const BAIANO_IMG_H       = 72;
const BAIANO_CHARGE_T    = 3.5;
const BAIANO_Z_SPD       = 520;
const BAIANO_Z_BURST_N   = 3;
const BAIANO_Z_BURST_DLY = 0.30;  // intervalo entre cada Z do burst
const BAIANO_Z_WINDOW    = 0.5;   // gap máximo entre hits para manter chain
const BAIANO_FREEZE_DUR  = 0.75;

// ── RECEITA FEDERAL CONSTANTS ───────────────────────────────────
const RF_SZ          = 72;
const RF_CHARGE_T    = 2.0;
const RF_PROJ_SPD    = 300;
const RF_PROJ_DMG    = 40;
const RF_PROJ_HEAL   = 20;
const RF_PROJ_SZ     = 35;
const RF_COLLECT_DELAY = 0.5; // delay após coletar o dinheiro antes de atirar de novo
const RF_MONEY_SZ    = 35;
const RF_TURN_SPD    = 3.2;  // rad/s — quão rápido o ladrão vira em direção ao alvo

// ── DOG CONSTANTS ─────────────────────────────────────────────────
const DOG_SZ              = 80;
const DOG_HP1             = 200;
const DOG_HP2             = 2000;
const DOG_EVADE_DUR       = 20.0;  // fase evade dura 20s
const DOG_PHASE2_HP       = 2000;
const DOG_ARENA_TARGET    = 600;
const DOG_ARENA_EXPAND_DUR= 3.0;
const DOG_EVASION_DUR     = 10.0;
const DOG_REFLECT_DUR     = 20.0;
const DOG_FINAL_DUR       = 5.0;
const DOG_TELEPORT_DUR    = 0.1;
const DOG_ORBITAL_R       = 110;

const SOUL_TIMINGS = [0.1, 2.4, 5.2, 7.4, 10.0, 12.4, 14.6];
const SOUL_KEYS    = ['Dog1','Dog6','Dog2','Dog3','Dog4','Dog5','MainDog'];
const SOUL_ANGLES  = [
  -Math.PI/2,    // top (12h)
  -Math.PI/6,    // upper-right (2h)
   Math.PI/6,    // lower-right (4h)
   Math.PI/2,    // bottom (6h)
   5*Math.PI/6,  // lower-left (8h)
  -5*Math.PI/6,  // upper-left (10h)
];
const SOUL_SLOTS = SOUL_KEYS.slice(0,6).map((key,i) => ({ key, angle: SOUL_ANGLES[i] }));
// Cutscene absolute timers (seconds since cutscene begins)
const CS_MUSIC_START  = 1.0;
const CS_ORBIT_START  = CS_MUSIC_START + 14.6 + 1.0; // 16.6
const CS_FLASH_START  = CS_ORBIT_START + 3.0;          // 19.6
const CS_END          = CS_FLASH_START + 0.5;           // 20.1
