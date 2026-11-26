/* ============ 规则预设 / 计分 ============ */

const DEFAULT_RULES = {
  baseScore: 1,        // 底分
  fanCap: 8,           // 封顶番数
  minFan: 0,           // 起胡番数
  allowChi: true,      // 允许吃
  allowZimo: true,     // 允许自摸
  zimoOnly: false,     // 只能自摸（不吃炮）
  requireMenqing: false, // 必须门清才能胡
  sevenPairs: true,    // 允许七对
  blood: false,        // 血战到底
  queyise: false,      // 缺一门才能胡
  qiangGang: true,     // 允许抢杠胡
  kongScoring: true,   // 杠分即时结算
  liujuLianzhuang: true, // 流局连庄
  zimoFan: 1, menqingFan: 1, pengpengFan: 2,
  qingyiseFan: 4, hunyiseFan: 2, qiduiFan: 6, duanyaoFan: 2,
  dealerFan: 1, gangHuaFan: 1, haiDiFan: 1, qiangGangFan: 1,
  ziyiseFan: 8
};

const PRESETS = {
  guangdong: {
    key: 'guangdong', name: '广东推倒胡',
    desc: '可吃碰杠 · 允许七对 · 自摸/点炮均可胡 · 门清加番',
    rules: { ...DEFAULT_RULES }
  },
  sichuan: {
    key: 'sichuan', name: '四川血战',
    desc: '缺一门 · 只能自摸 · 血战到底（一家胡后继续打）',
    rules: {
      ...DEFAULT_RULES,
      allowChi: false, zimoOnly: true, requireMenqing: false,
      blood: true, queyise: true, sevenPairs: true,
      fanCap: 4, zimoFan: 0, dealerFan: 0, kongScoring: true
    }
  },
  guobiao: {
    key: 'guobiao', name: '国标简化',
    desc: '可吃碰杠 · 起胡 8 番 · 番种丰富（清一色/碰碰胡/七对等）',
    rules: {
      ...DEFAULT_RULES,
      minFan: 8, fanCap: 16, zimoFan: 1, menqingFan: 2,
      pengpengFan: 6, qingyiseFan: 6, hunyiseFan: 2, qiduiFan: 12,
      duanyaoFan: 2, dealerFan: 0
    }
  },
  zhuanzhuan: {
    key: 'zhuanzhuan', name: '南昌/转转麻将',
    desc: '随便胡 · 碰碰胡优先 · 只有自摸和点炮，节奏快',
    rules: {
      ...DEFAULT_RULES,
      allowChi: false, zimoOnly: false, sevenPairs: false,
      fanCap: 3, minFan: 0, pengpengFan: 2, qingyiseFan: 2,
      hunyiseFan: 1, qiduiFan: 0, dealerFan: 1
    }
  },
  custom: {
    key: 'custom', name: '自定义规则',
    desc: '自由配置所有规则项',
    rules: { ...DEFAULT_RULES }
  }
};

/** 规则表单字段（自动生成 UI） */
const RULE_FIELDS = [
  { key: 'baseScore', label: '底分', type: 'number', min: 1, max: 100, group: '计分' },
  { key: 'fanCap', label: '封顶番数', type: 'number', min: 1, max: 24, group: '计分' },
  { key: 'minFan', label: '起胡番数', type: 'number', min: 0, max: 16, group: '计分' },
  { key: 'kongScoring', label: '杠分即时结算', type: 'bool', group: '计分' },
  { key: 'dealerFan', label: '庄家加番', type: 'number', min: 0, max: 4, group: '计分' },

  { key: 'allowChi', label: '允许吃牌', type: 'bool', group: '玩法' },
  { key: 'allowZimo', label: '允许自摸', type: 'bool', group: '玩法' },
  { key: 'zimoOnly', label: '只能自摸（不吃炮）', type: 'bool', group: '玩法' },
  { key: 'requireMenqing', label: '必须门清才能胡', type: 'bool', group: '玩法' },
  { key: 'sevenPairs', label: '允许七对子', type: 'bool', group: '玩法' },
  { key: 'blood', label: '血战到底（多家胡）', type: 'bool', group: '玩法' },
  { key: 'queyise', label: '缺一门才能胡', type: 'bool', group: '玩法' },
  { key: 'qiangGang', label: '允许抢杠胡', type: 'bool', group: '玩法' },
  { key: 'liujuLianzhuang', label: '流局连庄', type: 'bool', group: '玩法' },

  { key: 'zimoFan', label: '自摸加番', type: 'number', min: 0, max: 4, group: '番种' },
  { key: 'menqingFan', label: '门清加番', type: 'number', min: 0, max: 4, group: '番种' },
  { key: 'pengpengFan', label: '碰碰胡番数', type: 'number', min: 0, max: 12, group: '番种' },
  { key: 'qingyiseFan', label: '清一色番数', type: 'number', min: 0, max: 12, group: '番种' },
  { key: 'hunyiseFan', label: '混一色番数', type: 'number', min: 0, max: 8, group: '番种' },
  { key: 'qiduiFan', label: '七对番数', type: 'number', min: 0, max: 16, group: '番种' },
  { key: 'duanyaoFan', label: '断幺九番数', type: 'number', min: 0, max: 8, group: '番种' },
  { key: 'gangHuaFan', label: '杠上开花加番', type: 'number', min: 0, max: 4, group: '番种' },
  { key: 'haiDiFan', label: '海底捞月加番', type: 'number', min: 0, max: 4, group: '番种' },
  { key: 'qiangGangFan', label: '抢杠胡加番', type: 'number', min: 0, max: 4, group: '番种' },
  { key: 'ziyiseFan', label: '字一色番数', type: 'number', min: 0, max: 16, group: '番种' }
];

function sanitizeRules(r) {
  const out = { ...DEFAULT_RULES };
  for (const f of RULE_FIELDS) {
    if (r && r[f.key] !== undefined && r[f.key] !== null) {
      out[f.key] = f.type === 'bool' ? !!r[f.key] : Math.max(f.min ?? 0, Math.min(f.max ?? 999, +r[f.key] || 0));
    }
  }
  return out;
}

function rulesSummary(r) {
  const parts = [];
  const p = Object.values(PRESETS).find(p => p.rules && p.key !== 'custom' &&
    RULE_FIELDS.every(f => (p.rules[f.key] ?? DEFAULT_RULES[f.key]) === r[f.key]));
  if (p) return `${p.name}：${p.desc}`;
  parts.push(`底分${r.baseScore} · 封顶${r.fanCap}番`);
  if (r.minFan) parts.push(`起胡${r.minFan}番`);
  parts.push(r.allowChi ? '可吃' : '不可吃');
  if (r.zimoOnly) parts.push('只能自摸');
  if (r.blood) parts.push('血战到底');
  if (r.queyise) parts.push('缺一门');
  if (r.requireMenqing) parts.push('门清胡');
  if (!r.sevenPairs) parts.push('无七对');
  return parts.join(' · ');
}

function cloneRules(r) { return JSON.parse(JSON.stringify(r)); }

/* ============ 胡牌计分 ============ */
/**
 * handCounts: 胡牌者手牌 counts（14 张，含胡的那张）
 * melds: 副露数组
 * selfDraw: 是否自摸
 * rules, ctx: { dealer, winner, discarder, gangHua, haiDi, qiangGang }
 */
function scoreWin(handCounts, melds, selfDraw, rules, ctx) {
  const items = [{ name: '和牌', fan: 1 }];

  // ---- 七对 ----
  let sevenPairs = false;
  const total = handCounts.reduce((a, b) => a + b, 0);
  if (melds.length === 0 && rules.sevenPairs && total === 14) {
    let pairs = 0, quad = 0;
    for (const v of handCounts) { if (v === 2) pairs++; else if (v === 4) quad++; }
    if (pairs + quad * 2 === 7) {
      sevenPairs = true;
      items.push({ name: '七对子', fan: rules.qiduiFan });
      if (quad) items.push({ name: '龙七对', fan: 2 });
    }
  }

  // ---- 碰碰胡 ----
  const meldOnly = melds.length === 0 ? true : melds.every(m => m.type !== 'chi');
  const menqing = melds.every(m => m.type === 'anggang');
  if (!sevenPairs && meldOnly) {
    let pairCnt = 0, bad = false;
    for (const v of handCounts) {
      if (v === 0) continue;
      if (v === 2) pairCnt++;
      else if (v === 3) { /* 刻子 */ }
      else bad = true;
    }
    if (!bad && pairCnt === 1) items.push({ name: '碰碰胡', fan: rules.pengpengFan });
  }

  // ---- 花色类 ----
  const suitSet = new Set();
  for (let i = 0; i < 34; i++) if (handCounts[i] > 0) suitSet.add(ALL_KINDS[i][0]);
  for (const m of melds) {
    const ts = m.type === 'chi' ? m.tiles : [m.tile];
    ts.forEach(t => suitSet.add(t[0]));
  }
  const numSuits = [...suitSet].filter(s => s !== 'f' && s !== 'j');
  const hasHonor = [...suitSet].some(s => s === 'f' || s === 'j');
  if (numSuits.length === 0 && hasHonor) {
    items.push({ name: '字一色', fan: rules.ziyiseFan });
  } else if (numSuits.length === 1 && hasHonor) {
    items.push({ name: '混一色', fan: rules.hunyiseFan });
  } else if (numSuits.length === 1 && !hasHonor) {
    items.push({ name: '清一色', fan: rules.qingyiseFan });
  }

  // ---- 字牌刻 ----
  const hasTriplet = k => {
    if (handCounts[KIDX[k]] >= 3) return true;
    return melds.some(m => m.type !== 'chi' && m.tile === k);
  };
  if (['j1', 'j2', 'j3'].every(hasTriplet)) items.push({ name: '大三元', fan: 8 });
  const windTrips = ['f1', 'f2', 'f3', 'f4'].filter(hasTriplet).length;
  const windPair = ['f1', 'f2', 'f3', 'f4'].some(k => handCounts[KIDX[k]] === 2);
  if (windTrips === 4) items.push({ name: '大四喜', fan: 8 });
  else if (windTrips === 3 && windPair) items.push({ name: '小四喜', fan: 6 });

  // ---- 断幺九 ----
  let anyYao = false;
  for (let i = 0; i < 34; i++) {
    if (handCounts[i] > 0 && (i < 27 ? (i % 9 === 0 || i % 9 === 8) : true)) anyYao = true;
  }
  if (!anyYao) {
    for (const m of melds) {
      const ts = m.type === 'chi' ? m.tiles : [m.tile];
      if (ts.some(t => isHonor(t) || ['1', '9'].includes(t[1]))) anyYao = true;
    }
  }
  if (!anyYao) items.push({ name: '断幺九', fan: rules.duanyaoFan });

  // ---- 门清 / 局面番 ----
  if (menqing) items.push({ name: '门清', fan: rules.menqingFan });
  if (selfDraw && rules.zimoFan > 0) items.push({ name: '自摸', fan: rules.zimoFan });
  if (selfDraw && ctx.gangHua) items.push({ name: '杠上开花', fan: rules.gangHuaFan });
  if (ctx.haiDi) items.push({ name: '海底捞月', fan: rules.haiDiFan });
  if (ctx.qiangGang) items.push({ name: '抢杠胡', fan: rules.qiangGangFan });
  if (rules.dealerFan > 0 && (ctx.winner === ctx.dealer || ctx.discarder === ctx.dealer)) {
    items.push({ name: '庄家', fan: rules.dealerFan });
  }

  const fan = items.reduce((a, b) => a + b.fan, 0);
  const capped = Math.min(fan, rules.fanCap);
  const points = rules.baseScore * Math.pow(2, capped);
  return { fan, capped, items, points, ok: fan >= (rules.minFan || 0) };
}
