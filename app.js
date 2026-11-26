/* ============ 主应用 ============ */

const S = {
  screen: 'auth',
  profile: null,
  offline: true,
  presetKey: 'guangdong',
  rules: cloneRules(PRESETS.guangdong.rules),
  mode: null,            // 'single' | 'room'
  engine: null,
  mySeat: 0,
  isHost: false,
  players: [],           // 联机房间玩家
  hostState: null,       // 联机客户端收到的状态
  pendingClaimDecisions: null,
  claimTimer: null,
  botTimer: null,
  pollTimer: null,
  chat: [],
  roundModalOpen: false,
  gameStarted: false
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const App = {
  /* ================= 初始化 ================= */
  async init() {
    await Net.init();
    if (!Net.offline && (Net.profile || Net.user)) {
      S.profile = Net.profile || { username: (Net.user.email || '玩家').split('@')[0], chips: 0 };
      S.offline = false;
      this.show('lobby');
      if (Net.profileError) {
        this.showBanner(Net.profileError);
      } else {
        this.checkDb();
      }
    } else {
      this.show('auth');
      if (Net.profileError) this.showBanner(Net.profileError);
      else this.checkDb();
    }
    this.bindAuth();
    this.bindLobby();
    this.bindGame();
    // 邀请链接预填
    const invite = new URLSearchParams(location.search).get('invite');
    if (invite) $('#reg-invite').value = invite;
  },

  /** 数据库自检：未登录只看连通性；登录后检查表授权 */
  async checkDb() {
    if (Net.offline) return;
    if (!Net.user) {
      const ok = await Net.ping();
      if (!ok) this.showBanner('无法连接 Supabase（' + Net.baseUrl() + '），请检查项目地址与网络', 'warn');
      else this.hideBanner();
      return;
    }
    const res = await Net.healthCheck();
    if (res.ok) { this.hideBanner(); return; }
    if (res.code === 'no_table' || res.code === 'no_grant') {
      this.showBanner(res.msg + '（这是最后一个初始化步骤）');
    } else if (res.code !== 'offline') {
      this.showBanner('Supabase 连接异常：' + res.msg, 'warn');
    }
  },

  showBanner(msg, type = 'error') {
    const el = $('#sys-banner');
    el.className = 'sys-banner' + (type === 'warn' ? ' warn' : '');
    el.innerHTML = `<span>${msg}</span><button class="close" title="关闭">×</button>`;
    el.querySelector('.close').addEventListener('click', () => this.hideBanner());
    el.classList.remove('hidden');
  },

  hideBanner() { $('#sys-banner').classList.add('hidden'); },

  show(screen) {
    S.screen = screen;
    ['auth', 'lobby', 'game'].forEach(s => $('#screen-' + s).classList.toggle('hidden', s !== screen));
    if (screen === 'lobby') this.renderLobby();
    if (screen === 'game') this.renderGame();
  },

  /* ================= 登录 / 注册 ================= */
  bindAuth() {
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $('#form-login').classList.toggle('hidden', t.dataset.tab !== 'login');
      $('#form-register').classList.toggle('hidden', t.dataset.tab !== 'register');
    }));
    $('#form-login').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#form-login button[type=submit]');
      btn.disabled = true; btn.textContent = '登录中…';
      $('#login-error').textContent = '';
      try {
        await Net.signIn($('#login-email').value.trim(), $('#login-password').value);
        S.profile = Net.profile || { username: (Net.user.email || '玩家').split('@')[0], chips: 0 };
        S.offline = false;
        this.show('lobby');
        if (Net.profileError) {
          this.showBanner(Net.profileError, 'warn');
        } else {
          this.checkDb();
        }
      } catch (err) { $('#login-error').textContent = err.message; }
      btn.disabled = false; btn.textContent = '登录';
    });
    $('#form-register').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#form-register button[type=submit]');
      btn.disabled = true; btn.textContent = '注册中…';
      $('#register-error').textContent = '';
      try {
        await Net.signUp($('#reg-email').value.trim(), $('#reg-password').value,
          $('#reg-username').value.trim(), $('#reg-invite').value.trim());
        S.profile = Net.profile || { username: (Net.user.email || '玩家').split('@')[0], chips: 0 };
        S.offline = false;
        this.show('lobby');
        if (Net.profileError) {
          this.showBanner('注册成功！' + Net.profileError, 'warn');
        } else {
          this.checkDb();
        }
      } catch (err) { $('#register-error').textContent = err.message; }
      btn.disabled = false; btn.textContent = '注册并进入';
    });
    $('#btn-offline').addEventListener('click', () => {
      S.profile = Net.localProfile();
      S.offline = true;
      this.show('lobby');
    });
    $('#btn-logout').addEventListener('click', async () => {
      await Net.signOut();
      S.profile = null;
      this.show('auth');
    });
  },

  /* ================= 大厅 ================= */
  bindLobby() {
    $('#btn-single-rules').addEventListener('click', () => this.showRulesModal(r => {
      S.rules = r;
      this.renderLobby();
    }));
    $('#btn-single-start').addEventListener('click', () => this.startSingle());
    $('#btn-create-room').addEventListener('click', () => this.createRoom());
    $('#btn-join-room').addEventListener('click', () => this.joinRoom($('#join-code').value.trim()));
    $('#btn-copy-invite').addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?invite=${Net.profile?.invite_code || ''}`;
      navigator.clipboard?.writeText(url);
      alert('邀请链接已复制：' + url);
    });
  },

  async renderLobby() {
    $('#lobby-username').textContent = S.profile?.username || '玩家';
    $('#lobby-chips').textContent = '💰 ' + (S.profile?.chips ?? 0);
    $('#single-rule-summary').textContent = rulesSummary(S.rules);
    $('#invite-box').classList.toggle('hidden', S.offline);
    if (S.offline) {
      $('#btn-create-room').disabled = true;
      $('#btn-join-room').disabled = true;
      $('#join-code').disabled = true;
      $('#join-error').textContent = '离线模式不支持联机，请在 config.js 配置 Supabase';
    }
    // 战绩
    if (!S.offline) {
      const rows = await Net.loadMyResults();
      if (rows.length) {
        const net = rows.reduce((a, r) => a + (r.delta || 0), 0);
        $('#standings-box').innerHTML =
          `<table><tr><th>近 ${rows.length} 局净胜分</th><th></th></tr>` +
          `<tr><td class="${net >= 0 ? 'pos' : ''}">${net >= 0 ? '+' : ''}${net}</td><td>场次 ${rows.length}</td></tr></table>` +
          rows.slice(0, 8).map(r => `<div class="tip-text">第${r.round_no}局 ${r.delta >= 0 ? '+' : ''}${r.delta} 分</div>`).join('');
      }
    }
  },

  /* ================= 规则设置弹窗 ================= */
  showRulesModal(onSave, readonly = false) {
    const r = S.rules;
    const groups = ['玩法', '计分', '番种'];
    let html = `
      <h2>⚖️ 麻将规则设置</h2>
      <div class="rules-tabs">${Object.values(PRESETS).map(p =>
        `<button data-preset="${p.key}" class="${p.key === S.presetKey ? 'active' : ''}">${p.name}</button>`).join('')}
      </div>
      <div class="preset-desc tip-text" id="preset-desc"></div>
      <div class="rules-form">`;
    for (const g of groups) {
      html += `<div style="grid-column:1/-1;font-weight:600;color:var(--accent);margin-top:6px">${g}</div>`;
      for (const f of RULE_FIELDS.filter(f => f.group === g)) {
        const v = r[f.key];
        if (f.type === 'bool') {
          html += `<label class="rule-item"><span>${f.label}</span>
            <input type="checkbox" data-key="${f.key}" ${v ? 'checked' : ''} ${readonly ? 'disabled' : ''}></label>`;
        } else {
          html += `<label class="rule-item"><span>${f.label}</span>
            <input type="number" data-key="${f.key}" value="${v}" min="${f.min}" max="${f.max}" ${readonly ? 'disabled' : ''}></label>`;
        }
      }
    }
    html += `</div>
      ${readonly ? '' : '<div class="modal-btns"><button id="rules-save" class="btn primary">保存规则</button><button id="rules-cancel" class="btn ghost">取消</button></div>'}`;
    const mask = this.modal(html);

    const desc = mask.querySelector('#preset-desc');
    const setDesc = () => { desc.textContent = PRESETS[mask.querySelector('.rules-tabs .active')?.dataset.preset]?.desc || ''; };
    setDesc();

    mask.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
      S.presetKey = btn.dataset.preset;
      const preset = cloneRules(PRESETS[S.presetKey].rules);
      mask.querySelectorAll('[data-key]').forEach(inp => {
        const k = inp.dataset.key;
        if (inp.type === 'checkbox') inp.checked = !!preset[k];
        else inp.value = preset[k];
      });
      mask.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b === btn));
      setDesc();
    }));

    if (!readonly) {
      mask.querySelector('#rules-cancel').addEventListener('click', () => this.closeModal());
      mask.querySelector('#rules-save').addEventListener('click', () => {
        const out = {};
        mask.querySelectorAll('[data-key]').forEach(inp => {
          out[inp.dataset.key] = inp.type === 'checkbox' ? inp.checked : +inp.value;
        });
        this.closeModal();
        onSave(sanitizeRules(out));
      });
    }
  },

  modal(html) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal">${html}</div>`;
    $('#modal-root').appendChild(mask);
    return mask;
  },
  closeModal() { $('#modal-root').innerHTML = ''; },

  /* ================= 单机模式 ================= */
  startSingle() {
    S.mode = 'single';
    S.mySeat = 0;
    S.isHost = true;
    S.gameStarted = true;
    S.hostState = null;
    S.chat = [];
    this.show('game');
    $('#room-overlay').classList.add('hidden');
    $('#game-title').textContent = '🎯 单机对局';
    S.engine = new MahjongEngine(S.rules, [S.profile.username, ...BOT_NAMES]);
    this.bindEngineEvents();
    this.renderChat();
    this.spawnDanmaku('大家好，多多关照', S.profile.username);
    this.renderGame();
    this.tick();
  },

  bindEngineEvents() {
    S.engine.events.onState = () => {
      if (S.mode === 'room' && S.isHost) {
        Net.send('state', { state: S.engine.serialize() });
      }
      this.renderGame();
    };
    S.engine.events.onRoundEnd = result => {
      if (S.mode === 'room' && S.isHost && Net.room) {
        Net.saveResults(Net.room.id, S.engine.roundNo, result, S.players.map(p => p?.user_id || 'bot'));
      }
      this.showRoundResult(result);
    };
    S.engine.events.onDanmaku = (text, author) => this.spawnDanmaku(text, author);
  },

  isBotSeat(seat) {
    if (S.mode === 'single') return seat !== 0;
    const pl = S.players[seat];
    return !pl || pl.is_bot || String(pl.user_id || '').startsWith('bot-');
  },

  seatName(seat) {
    if (S.mode === 'room') return S.players[seat]?.username || ('座位' + (seat + 1));
    return S.engine?.names?.[seat] || '';
  },

  /* 单机/房主：驱动引擎 */
  tick() {
    clearTimeout(S.botTimer);
    const e = S.engine;
    if (!e || S.screen !== 'game') return;
    if (e.phase === 'act') {
      const p = e.currentOptions.seat;
      if (this.isBotSeat(p)) {
        S.botTimer = setTimeout(() => {
          botChatter(e, p);
          this.applyAction(p, botAct(e, p));
        }, 700 + Math.random() * 500);
      }
    } else if (e.phase === 'claim') {
      const decisions = {};
      let needHuman = false;
      for (const cl of e.claims.claimants) {
        if (this.isBotSeat(cl.seat)) {
          decisions[cl.seat] = botClaim(e, cl.seat, cl.acts);
        } else needHuman = true;
      }
      if (!needHuman) {
        S.botTimer = setTimeout(() => {
          if (S.engine && S.engine.claims) S.engine.resolveClaims(decisions);
          this.tick();
        }, 600);
      } else {
        S.pendingClaimDecisions = decisions;
        // 人机同局：人类长时间不出声自动过
        if (S.mode === 'room' && S.isHost) {
          clearTimeout(S.claimTimer);
          S.claimTimer = setTimeout(() => {
            const en = S.engine;
            if (en && en.claims) {
              const dec = S.pendingClaimDecisions || {};
              for (const cl of en.claims.claimants) if (!(cl.seat in dec)) dec[cl.seat] = null;
              en.resolveClaims(dec);
              S.pendingClaimDecisions = null;
              this.tick();
            }
          }, 10000);
        }
        this.renderGame();
      }
    }
  },

  /** 应用玩家动作（单机 / 房主本地执行） */
  applyAction(seat, action) {
    const e = S.engine;
    if (!e) return;
    if (action.type === 'claim_pass') return;
    try {
      if (e.phase === 'act') {
        if (e.currentOptions?.seat !== seat) return;
        if (action.type === 'hu') e.doHu(seat, true, null, null);
        else if (action.type === 'anggang') e.doAnGang(seat, action.tile);
        else if (action.type === 'bugang') e.doBuGang(seat, action.tile);
        else if (action.type === 'discard') e.discard(seat, action.tile);
      } else if (e.phase === 'claim' && e.claims) {
        if (S.mode === 'room' && S.isHost) {
          // 联机：收集所有应答后统一裁决
          S.pendingClaimDecisions = S.pendingClaimDecisions || {};
          S.pendingClaimDecisions[seat] = action.type === 'pass' ? null : action;
          const all = e.claims.claimants.every(cl => cl.seat in S.pendingClaimDecisions);
          if (all) {
            clearTimeout(S.claimTimer);
            const dec = S.pendingClaimDecisions;
            S.pendingClaimDecisions = null;
            e.resolveClaims(dec);
            this.tick();
          } else {
            this.renderGame();
          }
          return;
        }
        // 单机：机器人已预填，直接合并裁决
        const dec = S.pendingClaimDecisions || {};
        dec[seat] = action.type === 'pass' ? null : action;
        S.pendingClaimDecisions = null;
        e.resolveClaims(dec);
        this.tick();
      }
    } catch (err) { console.warn('动作非法', err); }
    this.tick();
  },

  /* ================= 联机模式 ================= */
  async createRoom() {
    try {
      const room = await Net.createRoom(S.rules);
      S.mode = 'room';
      S.isHost = true;
      S.engine = null;
      S.gameStarted = false;
      this.show('game');
      $('#game-title').textContent = '🌐 房间 ' + room.code;
      Net.onMessage = p => this.onNetMessage(p);
      await this.refreshRoomPlayers();
      this.startPolling();
      this.renderChat();
    } catch (err) { alert('创建房间失败：' + Net.errText(err)); }
  },

  async joinRoom(code) {
    if (!code) return;
    try {
      const room = await Net.joinRoom(code);
      S.mode = 'room';
      S.isHost = false;
      S.engine = null;
      S.gameStarted = false;
      this.show('game');
      $('#game-title').textContent = '🌐 房间 ' + room.code;
      Net.onMessage = p => this.onNetMessage(p);
      await this.refreshRoomPlayers();
      this.startPolling();
      const msgs = await Net.loadChat(room.id);
      S.chat = msgs.map(m => ({ sys: false, username: m.username, text: m.text }));
      this.renderChat();
      this.renderGame();
    } catch (err) { $('#join-error').textContent = err.message; }
  },

  startPolling() {
    clearInterval(S.pollTimer);
    S.pollTimer = setInterval(async () => {
      if (S.screen !== 'game' || S.mode !== 'room') return;
      await this.refreshRoomPlayers();
    }, 2500);
  },

  async refreshRoomPlayers() {
    const players = await Net.fetchRoomPlayers();
    // 补齐到 4 个座位
    S.players = [0, 1, 2, 3].map(seat => players.find(p => p.seat === seat) || null);
    const me = S.players.find(p => p && p.user_id === Net.user?.id);
    if (me) S.mySeat = me.seat;
    const humans = S.players.filter(p => p && !p.is_bot && !String(p.user_id || '').startsWith('bot-'));
    const humansAgreed = humans.every(p => p.agreed);
    const full = S.players.every(Boolean);
    $('#room-code-display').textContent = Net.room?.code || '——';
    const started = S.gameStarted || !!S.engine;
    $('#room-players').innerHTML = S.players.map((p, i) => p
      ? `<div class="room-player"><span>${p.username}${p.seat === 0 ? '（房主）' : ''}</span>
           <span class="${p.agreed ? 'agree' : 'wait'}">${p.agreed || p.is_bot ? '✔ 已同意' : '… 未同意'}</span></div>`
      : `<div class="room-player empty">空座位 ${i + 1}（等待加入）</div>`).join('');
    $('#room-rules-view').textContent = rulesSummary(S.rules);
    $('#room-overlay').classList.toggle('hidden', started);
    if (!started) {
      $('#btn-agree-rules').classList.toggle('hidden', !Net.user || humans.find(p => p.user_id === Net.user.id)?.agreed);
      $('#btn-add-bot').classList.toggle('hidden', !(S.isHost && !full));
      $('#btn-start-room').classList.toggle('hidden', !(S.isHost && full && humansAgreed));
      $('#room-status').textContent = full && humansAgreed
        ? '✅ 全部玩家已同意规则，房主可开始对局'
        : '⏳ 等待所有玩家上桌并同意规则（需 4 个座位坐满）';
    }
  },

  bindGame() {
    $('#btn-view-rules').addEventListener('click', () => this.showRulesModal(null, true));
    $('#btn-standings').addEventListener('click', () => this.showStandings());
    $('#btn-toggle-chat').addEventListener('click', () => $('#chat-drawer').classList.toggle('hidden'));
    $('#btn-close-chat').addEventListener('click', () => $('#chat-drawer').classList.add('hidden'));
    $('#btn-quit').addEventListener('click', async () => {
      if (confirm('确定离开当前牌局？')) {
        clearInterval(S.pollTimer);
        clearTimeout(S.botTimer);
        if (S.mode === 'room') await Net.leaveRoom();
        S.engine = null; S.mode = null; S.gameStarted = false;
        this.show('lobby');
      }
    });
    // 房间等待层
    $('#btn-agree-rules').addEventListener('click', async () => {
      await Net.agreeRules();
      await this.refreshRoomPlayers();
    });
    $('#btn-add-bot').addEventListener('click', async () => {
      await Net.addBotPlayer();
      await this.refreshRoomPlayers();
    });
    $('#btn-start-room').addEventListener('click', () => this.startRoomGame());
    $('#btn-copy-room').addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?room=${Net.room?.code || ''}`;
      navigator.clipboard?.writeText(url);
      alert('房间链接已复制：' + url);
    });
    // 手牌出牌
    $('#my-hand').addEventListener('click', e => {
      const t = e.target.closest('.tile');
      if (!t || !t.dataset.kind) return;
      this.onMyTileClick(t.dataset.kind);
    });
    // 聊天
    $('#btn-send-chat').addEventListener('click', () => this.sendChat());
    $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') this.sendChat(); });
    const phrases = ['大家好，多多关照', '好牌！', '哎呀，打错了', '快点吧，我等到花儿都谢了', '稳住，我们能赢', 'GG', '下次一定', '不好意思啦'];
    $('#quick-phrases').innerHTML = phrases.map(p => `<button data-p="${p}">${p}</button>`).join('');
    $('#quick-phrases').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) { $('#chat-input').value = b.dataset.p; this.sendChat(); }
    });
  },

  async startRoomGame() {
    if (!S.isHost) return;
    const full = S.players.every(Boolean);
    const humans = S.players.filter(p => p && !p.is_bot && !String(p.user_id || '').startsWith('bot-'));
    if (!full || !humans.every(p => p.agreed)) { alert('需 4 个座位坐满且所有真人玩家同意规则'); return; }
    const names = S.players.map(p => p.username);
    S.gameStarted = true;
    S.engine = new MahjongEngine(S.rules, names);
    this.bindEngineEvents();
    $('#room-overlay').classList.add('hidden');
    Net.send('chat', { sys: true, text: '对局开始！' });
    this.renderChat();
    this.renderGame();
    this.tick();
  },

  onNetMessage(p) {
    if (p.type === 'state') {
      S.hostState = p.state;
      if (p.state && p.state.phase && p.state.phase !== 'idle') {
        S.gameStarted = true;
        $('#room-overlay').classList.add('hidden');
      }
      this.renderGame();
    } else if (p.type === 'action' && S.isHost) {
      if (p.seat === undefined || p.action === undefined) return;
      if (p.action === null || p.action.type === 'pass') {
        this.applyAction(p.seat, { type: 'pass' });
      } else {
        this.applyAction(p.seat, p.action);
      }
    } else if (p.type === 'chat') {
      if (p.sys) {
        this.pushChat({ sys: true, text: p.text });
        this.spawnDanmaku(p.text, '系统');
      } else {
        this.pushChat({ username: p.username, text: p.text });
        this.spawnDanmaku(p.text, p.username);
      }
    } else if (p.type === 'gameover') {
      this.showFinalStandings(p.scores, p.names);
    }
  },

  /* ================= 牌桌渲染 ================= */
  getState() {
    if (S.engine) return S.engine.serialize();
    return S.hostState;
  },

  renderGame() {
    const st = this.getState();
    if (!st) return;
    const mySeat = S.mySeat;
    $('#round-info').textContent =
      `第 ${st.roundNo} 局 · 庄家：${st.names[st.dealer]} · 余牌 ${st.wallCount} 张`;
    // 三个其他座位
    const posMap = { 1: 'seat-1', 2: 'seat-2', 3: 'seat-3' };
    for (let d = 1; d <= 3; d++) {
      const seat = (mySeat + d) % 4;
      const el = $('#' + posMap[d]);
      el.querySelector('.seat-name').textContent = st.names[seat];
      el.querySelector('.seat-score').textContent =
        `${st.scores[seat] >= 0 ? '+' : ''}${st.scores[seat]} 分`;
      el.querySelector('.seat-mark').textContent =
        (seat === st.dealer ? '🎯庄 ' : '') + (st.finished[seat] ? '🀄已胡' : '') +
        (st.turn === seat && (st.phase === 'act' || st.phase === 'draw') ? ' ←出牌' : '');
      el.querySelector('.seat-melds').innerHTML = st.melds[seat].map(m => this.meldHtml(m)).join('');
      el.querySelector('.river').innerHTML = st.rivers[seat].map(k => `<span class="tile small">${glyph(k)}</span>`).join('');
    }
    // 中央
    $('#wall-count').textContent = `余牌 ${st.wallCount} 张 · 第 ${st.roundNo} 局`;
    $('#turn-hint').textContent = st.phase === 'claim' ? '等待吃 / 碰 / 杠 / 胡…'
      : st.phase === 'act' ? `轮到 ${st.names[st.turn]}` : st.phase === 'over' ? '本局结束' : '';
    $('#last-discard').innerHTML = st.lastDiscard ? `<span class="tile">${glyph(st.lastDiscard)}</span>` : '';
    // 自己
    $('#my-seat-info').innerHTML =
      `<b>${st.names[mySeat]}</b>（你）· <span class="score">${st.scores[mySeat] >= 0 ? '+' : ''}${st.scores[mySeat]} 分</span>${mySeat === st.dealer ? ' · 🎯庄家' : ''}`;
    $('#my-melds').innerHTML = st.melds[mySeat].map(m => this.meldHtml(m)).join('');
    $('#my-hand').innerHTML = st.hands[mySeat].map(k => {
      const myTurn = st.phase === 'act' && st.currentOptions?.seat === mySeat;
      return `<button class="tile${myTurn ? ' selectable' : ''}" data-kind="${k}">${glyph(k)}</button>`;
    }).join('');
    // 客户端（联机非房主）：收到 over 状态时弹出结算
    if (S.mode === 'room' && !S.isHost && st.phase === 'over' && !S.roundModalOpen && st.result) {
      this.showRoundResult(st.result);
    }
    this.renderActionBar(st);
  },

  meldHtml(m) {
    if (m.type === 'chi') {
      return `<span class="meld-group">${m.tiles.map(k => `<span class="tile small">${glyph(k)}</span>`).join('')}</span>`;
    }
    const label = m.type === 'anggang' ? '暗杠' : m.type === 'gang' ? '明杠' : '碰';
    return `<span class="meld-group" title="${label}">${Array(3).fill(0).map(() => `<span class="tile small">${glyph(m.tile)}</span>`).join('')}${m.type !== 'peng' ? `<span class="tile small dim">${glyph(m.tile)}</span>` : ''}</span>`;
  },

  renderActionBar(st) {
    const bar = $('#action-bar');
    const mySeat = S.mySeat;
    let html = '';
    if (st.phase === 'act' && st.currentOptions?.seat === mySeat) {
      const o = st.currentOptions;
      html += `<span class="tip-text">点击手牌打出</span>`;
      if (o.canHu) html += `<button class="btn hu" data-act="hu">🀄 自摸胡</button>`;
      o.anGang.forEach(k => html += `<button class="btn gang" data-act="anggang" data-tile="${k}">暗杠 ${glyph(k)}</button>`);
      o.buGang.forEach(k => html += `<button class="btn gang" data-act="bugang" data-tile="${k}">补杠 ${glyph(k)}</button>`);
    } else if (st.phase === 'claim' && st.claims) {
      const mine = st.claims.claimants.find(c => c.seat === mySeat);
      if (mine) {
        const actNames = mine.acts.map(a => ({ hu: '胡', gang: '杠', peng: '碰', chi: '吃' }[a.type])).filter(Boolean).join(' / ');
        html += `<span class="tip-text">牌河 ${glyph(st.claims.tile)}：可 ${actNames || '选择'}</span>`;
        mine.acts.forEach(a => {
          if (a.type === 'hu') html += `<button class="btn hu" data-act="hu">🀄 胡</button>`;
          if (a.type === 'gang') html += `<button class="btn gang" data-act="gang">杠</button>`;
          if (a.type === 'peng') html += `<button class="btn peng" data-act="peng">碰</button>`;
          if (a.type === 'chi') html += `<button class="btn chi" data-act="chi" data-tiles='${JSON.stringify(a.tiles)}'>吃 ${a.tiles.map(glyph).join('')}</button>`;
        });
        html += `<button class="btn ghost" data-act="pass">过</button>`;
      } else {
        html = `<span class="tip-text">其他玩家正在决定…</span>`;
      }
    } else if (st.phase !== 'over') {
      html = `<span class="tip-text">${st.names[st.turn]} 行牌中…</span>`;
    }
    bar.innerHTML = html;
    bar.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      const tile = btn.dataset.tile;
      let action;
      if (act === 'hu') action = { type: 'hu' };
      else if (act === 'anggang') action = { type: 'anggang', tile };
      else if (act === 'bugang') action = { type: 'bugang', tile };
      else if (act === 'gang') action = { type: 'gang' };
      else if (act === 'peng') action = { type: 'peng' };
      else if (act === 'chi') action = { type: 'chi', tiles: JSON.parse(btn.dataset.tiles) };
      else if (act === 'pass') action = { type: 'pass' };
      this.submitAction(action);
    }));
  },

  onMyTileClick(kind) {
    const st = this.getState();
    if (!st) return;
    if (st.phase === 'act' && st.currentOptions?.seat === S.mySeat) {
      this.submitAction({ type: 'discard', tile: kind });
    }
  },

  /** 提交动作：单机/房主 → 本地引擎；客户端 → 发给房主 */
  submitAction(action) {
    if (S.mode === 'single' || (S.mode === 'room' && S.isHost)) {
      if (action.type === 'pass') {
        this.applyAction(S.mySeat, { type: 'pass' });
      } else {
        this.applyAction(S.mySeat, action);
      }
    } else if (S.mode === 'room') {
      Net.send('action', { seat: S.mySeat, action });
    }
  },

  renderDanmakuState(st) {
    // 预留：状态型提示
  },

  /* ================= 弹幕 / 聊天 ================= */
  spawnDanmaku(text, author) {
    const layer = $('#danmaku-layer');
    if (!layer) return;
    const d = document.createElement('div');
    d.className = 'danmaku';
    d.style.top = (8 + Math.random() * 50) + '%';
    d.innerHTML = `<span class="dm-author">${author}</span>${text}`;
    layer.appendChild(d);
    setTimeout(() => d.remove(), 9500);
  },

  pushChat(msg) {
    S.chat.push(msg);
    if (S.chat.length > 200) S.chat.shift();
    this.renderChat();
  },

  renderChat() {
    const list = $('#chat-list');
    if (!list) return;
    list.innerHTML = S.chat.map(m => m.sys
      ? `<div class="chat-msg"><span class="sys">· ${m.text}</span></div>`
      : `<div class="chat-msg"><span class="who">${m.username}：</span>${m.text}</div>`).join('')
      || '<div class="tip-text">还没有消息，发条弹幕吧</div>';
    list.scrollTop = list.scrollHeight;
  },

  sendChat() {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.pushChat({ username: S.profile?.username || '我', text });
    this.spawnDanmaku(text, S.profile?.username || '我');
    if (S.mode === 'room') {
      Net.send('chat', { username: S.profile?.username, text });
      Net.saveChat(Net.room?.id, S.profile?.username, text);
    }
  },

  /* ================= 结算 ================= */
  showRoundResult(result) {
    if (S.roundModalOpen) return;
    S.roundModalOpen = true;
    const st = this.getState();
    const isController = S.mode === 'single' || S.isHost;
    let winnersHtml = '';
    if (result.liuju) {
      winnersHtml = `<p class="tip-text">流局 — 没有玩家胡牌</p>`;
    } else if (result.winners.length === 0) {
      winnersHtml = `<p class="tip-text">对局结束</p>`;
    } else {
      winnersHtml = result.winners.map(w => `
        <div class="fan-items">
          <div style="font-weight:600">${st.names[w.seat]} ${w.selfDraw ? '自摸' : '胡牌'} ${glyph(w.tile)} · ${w.fan} 番 · ${w.points} 分</div>
          ${w.items.map(i => `${i.name} +${i.fan}`).join(' · ')}
        </div>`).join('');
    }
    const rows = [0, 1, 2, 3].map(seat => `
      <tr><td>${st.names[seat]}${seat === st.dealer ? '（庄）' : ''}</td>
      <td class="${result.deltas[seat] >= 0 ? 'pos' : ''}">${result.deltas[seat] >= 0 ? '+' : ''}${result.deltas[seat]}</td>
      <td>${result.scores[seat]}</td></tr>`).join('');
    const mask = this.modal(`
      <h2>${result.liuju ? '🌊 流局' : '🎉 胡牌！'}</h2>
      ${winnersHtml}
      <table class="result-table"><tr><th>玩家</th><th>本局</th><th>累计</th></tr>${rows}</table>
      <div class="modal-btns">
        ${isController ? '<button id="btn-next-round" class="btn primary">▶ 下一局</button>' : '<span class="tip-text">等待房主操作…</span>'}
        ${isController ? '<button id="btn-end-game" class="btn ghost">🏁 结束牌局</button>' : ''}
      </div>`);
    if (isController) {
      mask.querySelector('#btn-next-round').addEventListener('click', () => {
        S.roundModalOpen = false;
        this.closeModal();
        if (S.mode === 'room' && S.isHost) {
          S.engine.nextRound();
          Net.send('state', { state: S.engine.serialize() });
        } else {
          S.engine.nextRound();
        }
        this.tick();
      });
      mask.querySelector('#btn-end-game')?.addEventListener('click', () => {
        S.roundModalOpen = false;
        this.closeModal();
        if (S.mode === 'room' && S.isHost) {
          Net.send('gameover', { scores: S.engine.scores, names: S.engine.names });
        }
        this.showFinalStandings(S.engine.scores, S.engine.names);
      });
    } else {
      // 客户端：房主开始下一局时 onNetMessage('state') 会自动刷新，这里监听弹窗关闭
      const watch = setInterval(() => {
        const st2 = this.getState();
        if (!S.roundModalOpen) { clearInterval(watch); return; }
        if (st2 && st2.phase !== 'over') {
          S.roundModalOpen = false;
          clearInterval(watch);
          this.closeModal();
        }
      }, 800);
    }
  },

  showStandings() {
    const st = this.getState();
    if (!st) return;
    const log = st.scoreLog || [];
    const rows = [0, 1, 2, 3].map(seat => `
      <tr><td>${st.names[seat]}</td><td class="${st.scores[seat] >= 0 ? 'pos' : ''}">${st.scores[seat] >= 0 ? '+' : ''}${st.scores[seat]}</td></tr>`).join('');
    const history = log.slice(-10).reverse().map(r => `
      <div class="tip-text">第${r.round}局：${r.reason === 'liuju' ? '流局' :
      r.winners.map(w => `${S.engine?.names?.[w.seat] || st.names[w.seat]} ${w.fan}番 ${w.points}分`).join('，') || '—'}
       ｜ 分差 ${r.deltas.map((d, i) => `${st.names[i]}${d >= 0 ? '+' : ''}${d}`).join(' ')}</div>`).join('');
    this.modal(`<h2>📊 计分板</h2>
      <table class="result-table"><tr><th>玩家</th><th>累计得分</th></tr>${rows}</table>
      ${history ? '<h3 style="font-size:14px">近 10 局</h3>' + history : '<p class="tip-text">暂无历史局</p>'}
      <div class="modal-btns"><button id="m-close" class="btn ghost">关闭</button></div>`)
      .querySelector('#m-close').addEventListener('click', () => this.closeModal());
  },

  showFinalStandings(scores, names) {
    const rank = [0, 1, 2, 3].sort((a, b) => scores[b] - scores[a]);
    const rows = rank.map((seat, i) => `
      <tr><td class="pos">第${i + 1}名</td><td>${names[seat]}</td>
      <td class="${scores[seat] >= 0 ? 'pos' : ''}">${scores[seat] >= 0 ? '+' : ''}${scores[seat]}</td></tr>`).join('');
    const mask = this.modal(`<h2>🏁 牌局结束</h2>
      <table class="result-table"><tr><th>名次</th><th>玩家</th><th>总得分</th></tr>${rows}</table>
      <div class="modal-btns"><button id="m-ok" class="btn primary">返回大厅</button></div>`);
    mask.querySelector('#m-ok').addEventListener('click', async () => {
      this.closeModal();
      clearInterval(S.pollTimer);
      if (S.mode === 'room') await Net.leaveRoom();
      S.engine = null; S.mode = null; S.gameStarted = false;
      this.show('lobby');
    });
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());

/* Node 环境自测用 */
if (typeof module !== 'undefined') { module.exports = { App, S }; }
