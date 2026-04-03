// ── CHAR TYPES ─────────────────────────────────────────────────
const CHAR_TYPES = [
  { name:'Você',             color:'#5B2D8E', cls:PlayerCharacter, isPlayer:true },
  { name:'Cara Vermelho', color:'#E74C3C', cls:Character },
  { name:'Cara Azul',     color:'#3498DB', cls:Character },
  { name:'Cara Verde',    color:'#2ECC71', cls:Character },
  { name:'Cara Roxo',     color:'#9B59B6', cls:Character },
  { name:'Cara Laranja',  color:'#E67E22', cls:Character },
  { name:'Cara Preto',    color:'#34495E', cls:Character },
  { name:'Tigrinho', color:'#FF8C00', cls:TigerCharacter },
  { name:'2 Caras Numa Moto', color:'#555555', cls:MotoCharacter },
  { name:'Neymar', color:'#FFD700', cls:NeymarCharacter },
  { name:'Baiano', color:'#3A7BD5', cls:BaianoCharacter },
  { name:'Receita Federal', color:'#2471A3', cls:ReceitaFederalCharacter },
  { name:'Jevil',           color:'#1a0030', cls:FinaleCharacter },
  { name:'Cachorro Caramelo', color:'#C68642', cls:DogCharacter },
  { name:'+ Personalizado', color:'#8E44AD', cls:null, isCustomSlot:true },
];

// ── SELECTION ──────────────────────────────────────────────────
const sel = {p1:0, p2:6}; // default: Vermelho vs Tiger

// Inicia chars customizados (async, antes do primeiro frame importa pouco)
initPlayerCustom().then(() => initCustomChars());

