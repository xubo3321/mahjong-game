/* ============ 机器人 AI ============ */

function botChooseDiscard(engine, p) {
  const hand = engine.hands[p];
  const uniq = [...new Set(hand)];
  const opts = engine.winOpts(p);
  let best = null;
  for (const k of uniq) {
    const cnt = hand.filter(t => t === k).length;
    const idx = hand.indexOf(k);
    hand.splice(idx, 1);
    const waits = tingTiles(countsFrom(hand), opts);
    hand.splice(idx, 0, k);
    // 评分：听牌数量优先；其次甩出孤立字牌 / 幺九
    let score = waits.length * 100;
    // 甩牌偏好：孤张字牌 > 孤张幺九 > 孤张中张；对子/搭子优先保留
    if (isHonor(k)) score += cnt === 1 ? 30 : 4;
    else {
      const n = +k.slice(1);
      if (n === 1 || n === 9) score += cnt === 1 ? 12 : 3;
      else if (cnt === 1) score += 6;
    }
    if (!best || score > best.score) best = { k, score, waits: waits.length };
  }
  return best ? best.k : hand[0];
}

function botAct(engine, p) {
  const opts = engine.currentOptions;
  if (!opts) return { type: 'discard', tile: botChooseDiscard(engine, p) };
  if (opts.canHu) return { type: 'hu' };
  if (opts.anGang.length) return { type: 'anggang', tile: opts.anGang[0] };
  // 补杠：简单起见直接补
  if (opts.buGang.length) return { type: 'bugang', tile: opts.buGang[0] };
  return { type: 'discard', tile: botChooseDiscard(engine, p) };
}

/** 弃牌后的争夺：是否吃 / 碰 / 杠 / 胡 */
function botClaim(engine, p, acts) {
  const hu = acts.find(a => a.type === 'hu');
  if (hu) return hu;
  const gang = acts.find(a => a.type === 'gang');
  if (gang) return gang;
  const opts = engine.winOpts(p);

  // 评估吃/碰：副露后能否听牌
  const tryAfter = (applyFn) => {
    const handBefore = engine.hands[p].slice();
    const meldsBefore = engine.melds[p].slice();
    const riverBefore = engine.rivers[engine.lastDiscarder].slice();
    const savedClaims = engine.claims;
    engine.claims = null;
    applyFn();
    let tenpai = false;
    if (engine.hands[p].length > 0) {
      for (const k of [...new Set(engine.hands[p])]) {
        const idx = engine.hands[p].indexOf(k);
        engine.hands[p].splice(idx, 1);
        if (tingTiles(countsFrom(engine.hands[p]), opts).length > 0) { tenpai = true; }
        engine.hands[p].splice(idx, 0, k);
        if (tenpai) break;
      }
    }
    engine.hands[p] = handBefore;
    engine.melds[p] = meldsBefore;
    engine.rivers[engine.lastDiscarder] = riverBefore;
    engine.claims = savedClaims;
    return tenpai;
  };

  const peng = acts.find(a => a.type === 'peng');
  if (peng) {
    const after = tryAfter(() => {
      for (let i = 0; i < 2; i++) engine.hands[p].splice(engine.hands[p].indexOf(engine.lastDiscard), 1);
      engine.melds[p].push({ type: 'peng', tile: engine.lastDiscard });
    });
    if (after) return peng;
  }
  const chi = acts.find(a => a.type === 'chi');
  if (chi) {
    const after = tryAfter(() => {
      for (const t of chi.tiles) {
        if (t === engine.lastDiscard) continue;
        const i = engine.hands[p].indexOf(t);
        if (i >= 0) engine.hands[p].splice(i, 1);
      }
      engine.melds[p].push({ type: 'chi', tiles: chi.tiles.slice() });
    });
    if (after) return chi;
  }
  return null;
}

/** 机器人闲聊（偶尔发弹幕） */
const BOT_CHATTER = ['这把稳了', '好牌！', '哎呀，打错了', '来了来了', '各位手下留情', '摸张好牌', '稳住别浪'];
function botChatter(engine, p) {
  if (Math.random() < 0.06 && engine.events.onDanmaku) {
    engine.events.onDanmaku(BOT_CHATTER[Math.floor(Math.random() * BOT_CHATTER.length)], engine.names[p]);
  }
}
