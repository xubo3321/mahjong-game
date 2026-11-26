/* 麻将牌基础定义 */
const TILE_KINDS = [];
for (let n = 1; n <= 9; n++) TILE_KINDS.push('m' + n); // 万
for (let n = 1; n <= 9; n++) TILE_KINDS.push('t' + n); // 筒
for (let n = 1; n <= 9; n++) TILE_KINDS.push('b' + n); // 条
const HONOR_KINDS = ['f1', 'f2', 'f3', 'f4', 'j1', 'j2', 'j3']; // 东南西北 中发白
const ALL_KINDS = TILE_KINDS.concat(HONOR_KINDS); // 34 种
const KIDX = {};
ALL_KINDS.forEach((k, i) => KIDX[k] = i);

const GLYPHS = {
  m: ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'],
  t: ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'],
  b: ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'],
  f: ['🀀','🀁','🀂','🀃'],
  j: ['🀄','🀅','🀆']
};

const NUM_CN = ['','一','二','三','四','五','六','七','八','九'];
const SUIT_CN = { m: '万', t: '筒', b: '条' };
const HONOR_CN = { f1: '东风', f2: '南风', f3: '西风', f4: '北风', j1: '红中', j2: '发财', j3: '白板' };

function glyph(k) {
  const s = k[0], n = +k.slice(1);
  return s === 'f' ? GLYPHS.f[n - 1] : s === 'j' ? GLYPHS.j[n - 1] : GLYPHS[s][n - 1];
}
function tileName(k) {
  if (isHonor(k)) return HONOR_CN[k];
  return NUM_CN[+k.slice(1)] + SUIT_CN[k[0]];
}
function isHonor(k) { return k[0] === 'f' || k[0] === 'j'; }
function suitOf(k) { return k[0]; }
function cmpTile(a, b) { return KIDX[a] - KIDX[b]; }

function countsFrom(tiles) {
  const c = new Array(34).fill(0);
  for (const t of tiles) c[KIDX[t]]++;
  return c;
}
function countsAdd(c, k, n = 1) { c[KIDX[k]] += n; }
function countsSub(c, k, n = 1) { c[KIDX[k]] -= n; }

/** 判断手牌 + 若干副露能否构成标准胡牌（n 面子 + 1 对子） */
function decomposeStd(c, i = 0, pairUsed = false) {
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) return pairUsed;
  // 对子
  if (!pairUsed && c[i] >= 2) {
    c[i] -= 2;
    const ok = decomposeStd(c, i, true);
    c[i] += 2;
    if (ok) return true;
  }
  // 刻子
  if (c[i] >= 3) {
    c[i] -= 3;
    const ok = decomposeStd(c, i, pairUsed);
    c[i] += 3;
    if (ok) return true;
  }
  // 顺子（仅数牌，且不跨花色）
  if (i < 27 && (i % 9) <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    const ok = decomposeStd(c, i, pairUsed);
    c[i]++; c[i + 1]++; c[i + 2]++;
    if (ok) return true;
  }
  return false;
}

/**
 * 胡牌判定
 * opts: { sevenPairs:boolean, meldCount:number }
 * 返回 false 或 { type:'std'|'seven', quad:number }
 */
function checkWinCounts(c, opts = {}) {
  const total = c.reduce((a, b) => a + b, 0);
  if (opts.sevenPairs && (opts.meldCount || 0) === 0 && total === 14) {
    let pairs = 0, quad = 0;
    for (const v of c) { if (v === 2) pairs++; else if (v === 4) quad++; }
    if (pairs + quad * 2 === 7) return { type: 'seven', quad };
  }
  if ((opts.meldCount || 0) > 0 && opts.sevenPairs) {
    // 有副露时只能标准胡
    return decomposeStd(c.slice()) ? { type: 'std' } : false;
  }
  return decomposeStd(c.slice()) ? { type: 'std' } : false;
}

/** 听牌集合：当前手牌（未胡）再加一张牌后能否胡 */
function tingTiles(handCounts, opts = {}) {
  const out = [];
  for (const k of ALL_KINDS) {
    if (handCounts[KIDX[k]] >= 4) continue;
    handCounts[KIDX[k]]++;
    if (checkWinCounts(handCounts, opts)) out.push(k);
    handCounts[KIDX[k]]--;
  }
  return out;
}

/** 洗牌 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
