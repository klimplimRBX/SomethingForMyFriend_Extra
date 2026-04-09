"use strict";

// ── IMAGE COMPRESSION ─────────────────────────────────────────
// Redimensiona e comprime imagem antes de salvar (evita quota overflow)
async function compressImg(dataUrl, maxW, maxH, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, maxW / w, maxH / h);
      w = Math.round(w * scale); h = Math.round(h * scale);
      if (w < 1) w = 1; if (h < 1) h = 1;
      const oc = document.createElement('canvas');
      oc.width = w; oc.height = h;
      oc.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(oc.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── TIGER IMAGES ───────────────────────────────────────────────
const TIGER_IMGS = {};
['Tiger','Orange','Wild','DefaultCard','GoldCard','GoldPot','Parchment'].forEach(key => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/${key}.png`;
  TIGER_IMGS[key] = img;
});

// Moto image
const MOTO_IMG = new Image();
MOTO_IMG.crossOrigin = 'anonymous';
MOTO_IMG.src = 'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/2CaraNumaMoto.png';

// Neymar images
const NEYMAR_IMGS = {};
['Neymar','Neymar2','BolaProp'].forEach(key => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/${key}.png`;
  NEYMAR_IMGS[key] = img;
});
function imgOk(img) { return img && img.complete && img.naturalWidth > 0; }

// ── WHITE SPRITE CACHE ─────────────────────────────────────────
// Pre-bakes a fully-white version of any image, preserving transparency.
// Uses source-atop composite so only non-transparent pixels become white.
const _whiteCache = new Map();
function getWhite(img) {
  if (!imgOk(img)) return null;
  if (_whiteCache.has(img)) return _whiteCache.get(img);
  const oc = document.createElement('canvas');
  oc.width  = img.naturalWidth;
  oc.height = img.naturalHeight;
  const ox  = oc.getContext('2d');
  ox.drawImage(img, 0, 0);
  ox.globalCompositeOperation = 'source-atop';
  ox.fillStyle = 'white';
  ox.fillRect(0, 0, oc.width, oc.height);
  _whiteCache.set(img, oc);
  return oc;
}

// Baiano image
const BAIANO_IMG = new Image();
BAIANO_IMG.crossOrigin = 'anonymous';
BAIANO_IMG.src = 'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/Baiano.png';

// Player gun image
const PLAYER_GUN_IMG = new Image();
PLAYER_GUN_IMG.crossOrigin = 'anonymous';
PLAYER_GUN_IMG.src = 'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/PlayerGun.png';

// Receita Federal images
const RF_IMGS = {};
['ReceitaFederal','Ladrao','Money'].forEach(key => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/${key}.png`;
  RF_IMGS[key] = img;
});

// Dog images
const DOG_IMGS = {};
['MainDog','Dog1','Dog2','Dog3','Dog4','Dog5','Dog6'].forEach(key => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/${key}.png`;
  DOG_IMGS[key] = img;
});
