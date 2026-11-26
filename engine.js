/* ============ 麻将对局引擎 ============ */

const BOT_NAMES = ['机器人·东', '机器人·南', '机器人·西'];

class MahjongEngine {
  constructor(rules, names) {
    this.rules = sanitizeRules(rules);
    this.names = names.slice(0, 4);
    this.scores = [0, 0, 0, 0];
    this.roundNo = 0;
    this.scoreLog = [];   // 每局结算记录
    this.events = {};     // { onState, onRoundEnd, onDanmaku }
    this.newRound();
  }

  newRound() {
    this.roundNo++;
    this.scoresBefore = this.scores.slice();
    const wall = [];
    for (const k of ALL_KINDS) for (let i = 0; i < 4; i++) wall.push(k);
    shuffle(wall);
    this.wall = wall;
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.rivers = [[], [], [], []];
    for (let r = 0; r < 13; r++) for (let p = 0; p < 4; p++) this.hands[p].push(wall.pop());
    this.hands.forEach(h => h.sort(cmpTile));
    this.winners = [];
    this.finished = [false, false, false, false];
    this.ctx = { gangHua: false, haiDi: false, qiangGang: false };
    this.turn = this.dealer === undefined ? Math.floor(Math.random() * 4) : this.dealer;
    if (this.roundNo === 1) this.turn = Math.floor(Math.random() * 4);
    this.dealer = this.turn;
    this.lastDiscard = null;
    this.lastDiscarder = null;
    this.claims = null;
    this.result = null;
    this.currentOptions = null;
    this.phase = 'draw';
    this.startTurn();
  }

  activePlayers() { return [0, 1, 2, 3].filter(p => !this.finished[p]); }
  nextActive(after) {
    for (let i = 1; i <= 4; i++) {
      const q = (after + i) % 4;
      if (!this.finished[q]) return q;
    }
    return after;
  }

  serialize() {
    return {
      rules: this.rules, names: this.names, scores: this.scores,
      roundNo: this.roundNo, dealer: this.dealer, wallCount: this.wall.length,
      hands: this.hands, melds: this.melds, rivers: this.rivers,
      turn: this.turn, phase: this.phase,
      lastDiscard: this.lastDiscard, lastDiscarder: this.lastDiscarder,
      claims: this.claims, winners: this.winners, finished: this.finished,
      result: this.result, currentOptions: this.currentOptions,
      scoreLog: this.scoreLog
    };
  }

  emit() { if (this.events.onState) this.events.onState(); }

  /* ---------- 胡牌判定 ---------- */
  winOpts(p = 0) { return { sevenPairs: !!this.rules.sevenPairs, meldCount: this.melds[p].length }; }

  checkWin(p, extra) {
    const c = countsFrom(this.hands[p]);
    if (extra) countsAdd(c, extra);
    return checkWinCounts(c, this.winOpts(p));
  }

  handMeldSuits(p) {
    const s = new Set();
    this.hands[p].forEach(t => s.add(t[0]));
    for (const m of this.melds[p]) (m.type === 'chi' ? m.tiles : [m.tile]).forEach(t => s.add(t[0]));
    return s;
  }

  /** 规则层面的胡牌校验（缺一门 / 门清 / 起胡番数） */
  huLegal(p, extraTile, selfDraw, ctxExtra = {}) {
    const win = this.checkWin(p, extraTile);
    if (!win) return false;
    if (this.rules.queyise) {
      const suits = new Set(this.handMeldSuits(p));
      if (extraTile) suits.add(extraTile[0]);
      const numSuits = [...suits].filter(s => s !== 'f' && s !== 'j');
      if (numSuits.length > 2) return false;
    }
    if (this.rules.requireMenqing) {
      // 点炮胡：被胡的那张尚未副露，按已有副露判断
      const bad = selfDraw ? this.melds[p].some(m => m.type !== 'anggang')
        : this.melds[p].some(m => m.type !== 'anggang');
      if (bad) return false;
    }
    if (this.rules.minFan > 0) {
      const c = countsFrom(this.hands[p]);
      if (extraTile) countsAdd(c, extraTile);
      const sc = scoreWin(c, this.melds[p], selfDraw, this.rules,
        { dealer: this.dealer, winner: p, ...ctxExtra });
      if (sc.fan < this.rules.minFan) return false;
    }
    return true;
  }

  tingSet(p) {
    const out = [];
    for (const k of ALL_KINDS) {
      if (this.hands[p].filter(t => t === k).length >= 4) continue;
      if (this.huLegal(p, k, false)) out.push(k);
    }
    return out;
  }

  /* ---------- 回合流程 ---------- */
  startTurn(drawn = false) {
    const act = this.activePlayers();
    if (act.length <= 1) { this.endHand('end'); return; }
    if (!drawn) {
      if (this.wall.length === 0) { this.endHand('liuju'); return; }
      const tile = this.wall.pop();
      this.hands[this.turn].push(tile);
      this.ctx.haiDi = this.wall.length === 0;
    }
    const p = this.turn;
    this.sortHand(p);
    const canHu = this.rules.allowZimo ? this.huLegal(p, null, true) : false;
    const anGang = [];
    for (const k of new Set(this.hands[p])) {
      if (this.hands[p].filter(t => t === k).length === 4) anGang.push(k);
    }
    const buGang = this.melds[p].filter(m => m.type === 'peng' && this.hands[p].includes(m.tile)).map(m => m.tile);
    this.phase = 'act';
    this.currentOptions = { seat: p, selfDraw: true, canHu, anGang, buGang };
    this.emit();
  }

  sortHand(p) { this.hands[p].sort(cmpTile); }

  discard(p, k) {
    const i = this.hands[p].indexOf(k);
    if (i < 0) return;
    this.hands[p].splice(i, 1);
    this.rivers[p].push(k);
    this.lastDiscard = k;
    this.lastDiscarder = p;
    this.ctx.gangHua = false;
    this.ctx.qiangGang = false;
    this.currentOptions = null;

    const claimants = [];
    for (const q of this.activePlayers()) {
      if (q === p) continue;
      const acts = [];
      if (!this.rules.zimoOnly && this.huLegal(q, k, false, { discarder: p })) acts.push({ type: 'hu' });
      const cnt = this.hands[q].filter(t => t === k).length;
      if (cnt >= 2) acts.push({ type: 'peng' });
      if (cnt >= 3) acts.push({ type: 'gang' });
      if (this.rules.allowChi && q === this.nextActive(p) && !isHonor(k)) {
        const n = +k.slice(1);
        for (let s = n - 2; s <= n; s++) {
          if (s < 1 || s > 7) continue;
          const others = [s, s + 1, s + 2].filter(x => x !== n).map(x => k[0] + x);
          if (others.every(o => this.hands[q].includes(o))) {
            acts.push({ type: 'chi', tiles: others.concat(k).sort(cmpTile) });
          }
        }
      }
      if (acts.length) claimants.push({ seat: q, acts });
    }
    if (claimants.length) {
      this.phase = 'claim';
      this.claims = { kind: 'discard', tile: k, from: p, claimants, responses: {} };
      this.emit();
    } else {
      this.emit();
      this.advanceAfterDiscard();
    }
  }

  advanceAfterDiscard() {
    const act = this.activePlayers();
    if (act.length <= 1) { this.endHand('end'); return; }
    if (this.wall.length === 0 && act.length === 4) { this.endHand('liuju'); return; }
    this.turn = this.nextActive(this.lastDiscarder);
    this.startTurn();
  }

  /* ---------- 副露 ---------- */
  doPeng(p, tile) {
    for (let i = 0; i < 2; i++) this.hands[p].splice(this.hands[p].indexOf(tile), 1);
    this.melds[p].push({ type: 'peng', tile });
    this.sortHand(p);
    this.turn = p;
    this.phase = 'act';
    this.currentOptions = { seat: p, selfDraw: false, canHu: false, anGang: [], buGang: [] };
    this.emit();
  }

  doChi(p, tiles) {
    // tiles: 排序后的顺子三张，其中一张来自牌河（其余两张从手牌移除）
    for (const t of tiles) {
      if (t === this.lastDiscard && this.rivers[this.lastDiscarder].at(-1) === t) { continue; }
      const i = this.hands[p].indexOf(t);
      if (i >= 0) this.hands[p].splice(i, 1);
    }
    this.melds[p].push({ type: 'chi', tiles: tiles.slice().sort(cmpTile) });
    this.sortHand(p);
    this.turn = p;
    this.phase = 'act';
    this.currentOptions = { seat: p, selfDraw: false, canHu: false, anGang: [], buGang: [] };
    this.emit();
  }

  kongPayments(p, type, from) {
    if (!this.rules.kongScoring) return;
    const base = this.rules.baseScore;
    if (type === 'ming') {
      if (from !== undefined) { this.scores[from] -= base; this.scores[p] += base; }
    } else if (type === 'an') {
      for (const q of this.activePlayers()) {
        if (q === p) continue;
        this.scores[q] -= base * 2; this.scores[p] += base * 2;
      }
    }
  }

  doMingGang(p, tile, from) {
    for (let i = 0; i < 3; i++) this.hands[p].splice(this.hands[p].indexOf(tile), 1);
    this.melds[p].push({ type: 'gang', tile, from });
    this.kongPayments(p, 'ming', from);
    this.kongDraw(p);
  }

  doAnGang(p, tile) {
    for (let i = 0; i < 4; i++) this.hands[p].splice(this.hands[p].indexOf(tile), 1);
    this.melds[p].push({ type: 'anggang', tile });
    this.kongPayments(p, 'an');
    this.kongDraw(p);
  }

  /** 补杠：先检查抢杠胡，否则转换 + 摸牌 */
  doBuGang(p, tile) {
    if (this.rules.qiangGang) {
      const claimants = [];
      for (const q of this.activePlayers()) {
        if (q === p) continue;
        if (this.huLegal(q, tile, false, { discarder: p, qiangGang: true })) {
          claimants.push({ seat: q, acts: [{ type: 'hu' }] });
        }
      }
      if (claimants.length) {
        this.phase = 'claim';
        this.claims = { kind: 'bugang', tile, from: p, claimants, responses: {} };
        this.emit();
        return;
      }
    }
    this.convertBuGang(p, tile);
  }

  convertBuGang(p, tile) {
    const m = this.melds[p].find(m => m.type === 'peng' && m.tile === tile);
    if (m) m.type = 'gang';
    this.hands[p].splice(this.hands[p].indexOf(tile), 1);
    this.kongPayments(p, 'ming');
    this.kongDraw(p);
  }

  kongDraw(p) {
    if (this.wall.length === 0) { this.endHand('liuju'); return; }
    const tile = this.wall.pop();
    this.hands[p].push(tile);
    this.ctx.gangHua = true;
    this.ctx.haiDi = this.wall.length === 0;
    this.turn = p;
    this.startTurn(true);
  }

  /* ---------- 胡 ---------- */
  doHu(p, selfDraw, tile, fromSeat) {
    if (!selfDraw && tile) {
      this.hands[p].push(tile);
      this.sortHand(p);
    }
    const c = countsFrom(this.hands[p]);
    const sc = scoreWin(c, this.melds[p], selfDraw, this.rules, {
      dealer: this.dealer, winner: p, discarder: selfDraw ? undefined : fromSeat,
      gangHua: selfDraw && this.ctx.gangHua, haiDi: this.ctx.haiDi, qiangGang: this.ctx.qiangGang
    });
    this.winners.push({ seat: p, fan: sc.fan, capped: sc.capped, items: sc.items, points: sc.points, selfDraw, tile });
    this.finished[p] = true;

    if (selfDraw) {
      for (const q of this.activePlayers()) {
        if (q === p) continue;
        this.scores[q] -= sc.points;
        this.scores[p] += sc.points;
      }
    } else {
      this.scores[fromSeat] -= sc.points;
      this.scores[p] += sc.points;
    }
    this.currentOptions = null;
    this.emit();

    if (!this.rules.blood) { this.endHand('hu'); return; }
    const act = this.activePlayers();
    if (act.length <= 1 || this.wall.length === 0) { this.endHand('hu'); return; }
    this.turn = this.nextActive(selfDraw ? p : fromSeat);
    this.startTurn();
  }

  /* ---------- 结算 ---------- */
  endHand(reason) {
    this.phase = 'over';
    const deltas = [0, 1, 2, 3].map(p => this.scores[p] - this.scoresBefore[p]);
    const liuju = reason === 'liuju';
    const nextDealer = (liuju && this.rules.liujuLianzhuang) ? this.dealer : (this.dealer + 1) % 4;
    this.result = {
      reason, liuju, winners: this.winners, deltas,
      scores: this.scores.slice(), nextDealer
    };
    this.scoreLog.push({
      round: this.roundNo, reason, winners: this.winners.map(w => ({
        seat: w.seat, fan: w.fan, points: w.points, selfDraw: w.selfDraw, items: w.items
      })), deltas
    });
    this.dealer = nextDealer;
    this.emit();
    if (this.events.onRoundEnd) this.events.onRoundEnd(this.result);
  }

  nextRound() { this.newRound(); }

  /* ---------- 声明（吃碰杠胡）窗口 ---------- */
  resolveClaims(decisions) {
    const claims = this.claims;
    if (!claims) return;
    this.claims = null;
    const order = { hu: 0, gang: 1, peng: 2, chi: 3 };

    if (claims.kind === 'bugang') {
      // 只接受胡（抢杠）
      const huSeat = Object.entries(decisions)
        .map(([s, a]) => [+s, a])
        .filter(([s, a]) => a && a.type === 'hu')
        .map(([s]) => s)[0];
      if (huSeat !== undefined) {
        this.ctx.qiangGang = true;
        this.doHu(huSeat, false, claims.tile, claims.from);
      } else {
        this.convertBuGang(claims.from, claims.tile);
      }
      return;
    }

    // 弃牌后的吃碰杠胡竞争
    let best = null;
    for (const [seatStr, act] of Object.entries(decisions)) {
      if (!act) continue;
      const seat = +seatStr;
      const cl = claims.claimants.find(c => c.seat === seat);
      if (!cl) continue;
      const match = cl.acts.find(a =>
        a.type === act.type && (!act.tiles || JSON.stringify(a.tiles) === JSON.stringify(act.tiles)));
      if (!match) continue;
      if (!best || order[act.type] < order[best.act.type] ||
        (order[act.type] === order[best.act.type] && seat < best.seat)) {
        best = { seat, act: match };
      }
    }
    if (best) {
      const { seat, act } = best;
      this.rivers[claims.from].pop(); // 被要走的牌从牌河移除
      if (act.type === 'hu') this.doHu(seat, false, claims.tile, claims.from);
      else if (act.type === 'peng') this.doPeng(seat, claims.tile);
      else if (act.type === 'gang') this.doMingGang(seat, claims.tile, claims.from);
      else if (act.type === 'chi') this.doChi(seat, act.tiles);
    } else {
      this.advanceAfterDiscard();
    }
  }
}

/* 兼容 Node 测试环境导出 */
if (typeof module !== 'undefined') {
  module.exports = { MahjongEngine };
}
