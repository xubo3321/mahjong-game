/* ============ Supabase 网络层 ============
 * 静态部署于 Cloudflare Pages，数据存 Supabase：
 *  - 认证：Supabase Auth（邮箱注册/登录）
 *  - 数据：profiles / rooms / room_players / game_results / chat_messages
 *  - 实时：Supabase Realtime Broadcast（房间内状态同步 + 聊天弹幕）
 * 未配置 SUPABASE_URL 时自动进入离线模式（仅单机）。
 */

const Net = {
  client: null,
  ready: false,
  offline: true,
  user: null,
  profile: null,
  channel: null,
  room: null,

  configured() {
    return !!(window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL && window.APP_CONFIG.SUPABASE_ANON_KEY);
  },

  /** 允许填 https://xxx.supabase.co 或 https://xxx.supabase.co/rest/v1/ */
  baseUrl() {
    return String(window.APP_CONFIG.SUPABASE_URL)
      .trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  },

  async init() {
    if (!this.configured()) { this.offline = true; return; }
    try {
      await this._loadSdk();
      this.client = window.supabase.createClient(
        this.baseUrl(), window.APP_CONFIG.SUPABASE_ANON_KEY
      );
      const { data } = await this.client.auth.getSession();
      this.user = data?.session?.user || null;
      if (this.user) {
        try { this.profile = await this.ensureProfile(this.user); }
        catch (pe) { this.profileError = pe.message; }
      }
      this.offline = false;
      this.ready = true;
    } catch (e) {
      console.warn('Supabase 初始化失败，进入离线模式', e);
      this.offline = true;
    }
  },

  /** 仅验证网络可达性：只要能收到 HTTP 响应就算连通（401/404 也说明服务在线） */
  async ping() {
    if (this.offline) return false;
    try {
      await fetch(this.baseUrl() + '/auth/v1/health', {
        headers: { apikey: window.APP_CONFIG.SUPABASE_ANON_KEY }
      });
      return true;
    } catch (e) { return false; }
  },

  /** 数据库健康自检：识别“表不存在 / 缺少 GRANT 授权”（需已登录，走 authenticated 角色） */
  async healthCheck() {
    if (this.offline || !this.client) return { ok: false, code: 'offline', msg: '未连接到 Supabase' };
    const { error } = await this.client.from('profiles').select('id').limit(1);
    if (!error) return { ok: true };
    if (error.code === '42501') {
      return { ok: false, code: 'no_grant', msg: '数据库缺少表授权：请在 Supabase SQL Editor 执行 supabase/fix-grants.sql' };
    }
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return { ok: false, code: 'no_table', msg: '数据表不存在：请在 Supabase SQL Editor 执行 supabase/schema.sql' };
    }
    return { ok: false, code: 'other', msg: error.message };
  },

  /** Supabase 英文报错 -> 中文提示 */
  errText(err) {
    const m = (err && (err.message || err.error_description || err.msg)) || '未知错误';
    const map = [
      ['Invalid login credentials', '邮箱或密码错误'],
      ['Email not confirmed', '邮箱尚未确认：请到邮箱点确认链接，或在 Supabase 关闭「Confirm email」'],
      ['User already registered', '该邮箱已注册，请直接登录'],
      ['Password should be at least', '密码至少 6 位'],
      ['Unable to validate email address', '邮箱格式不正确'],
      ['Signups not allowed', '项目已关闭注册（Authentication 设置中开启）'],
      ['Email rate limit exceeded', '邮件发送过于频繁，请稍后再试'],
      ['permission denied', '数据库缺少表授权：请执行 supabase/fix-grants.sql'],
      ['duplicate key', '昵称已被占用，请换一个'],
      ['relation "public.profiles" does not exist', '数据表不存在：请执行 supabase/schema.sql']
    ];
    for (const [k, v] of map) if (m.includes(k)) return v;
    return m;
  },

  _loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  },

  /* ---------- 离线本地账号 ---------- */
  localProfile() {
    let raw = localStorage.getItem('mj_local_profile');
    if (!raw) {
      const p = { id: 'local-' + Math.random().toString(36).slice(2, 10), username: '玩家' + Math.floor(Math.random() * 900 + 100), chips: 1000, invite_code: null };
      raw = JSON.stringify(p);
      localStorage.setItem('mj_local_profile', raw);
    }
    return JSON.parse(raw);
  },

  /* ---------- 注册 / 登录 ---------- */
  genInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  },

  async signUp(email, password, username, inviteCode) {
    if (this.offline) throw new Error('离线模式不支持注册，请先在 config.js 配置 Supabase');
    // 首选：部署的 Pages Function（服务端自动确认邮箱，注册即可登录）
    try {
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, inviteCode })
      });
      if (r.ok) {
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || '注册失败');
        this._needsDbGrant = !!d.needsDbGrant;
        return await this.signIn(email, password); // 用户已确认，直接登录
      }
      // 非 ok（如函数未部署返回 404）→ 回退直连注册
    } catch (e) {
      if (!(e instanceof TypeError)) throw e; // 业务错误直接抛出
    }
    // 回退：客户端直连注册（此时需邮箱确认，取决于项目设置）
    const { data, error } = await this.client.auth.signUp({
      email, password, options: { data: { username } }
    });
    if (error) throw new Error(this.errText(error));
    this.user = data.user;
    if (!data.session) {
      throw new Error('已向邮箱发送确认链接。若想注册后直接进入，请部署 Pages Functions 或在 Supabase 控制台关闭「Confirm email」');
    }
    // 创建档案（昵称冲突时自动加后缀）
    let name = username;
    let pe = await this.client.from('profiles').insert({
      id: data.user.id, username: name, invite_code: this.genInviteCode(), chips: 100
    });
    if (pe.error && String(pe.error.message).includes('duplicate')) {
      name = username + Math.floor(Math.random() * 900 + 100);
      pe = await this.client.from('profiles').insert({
        id: data.user.id, username: name, invite_code: this.genInviteCode(), chips: 100
      });
    }
    if (pe.error && pe.error.code === '42501') {
      throw new Error('数据库缺少表授权：请在 Supabase SQL Editor 执行 supabase/fix-grants.sql');
    }
    // 使用邀请码
    if (inviteCode) {
      const { error: ie } = await this.client.rpc('use_invite', { p_code: inviteCode.toUpperCase() });
      if (ie) console.warn('邀请码使用失败:', ie.message);
    }
    this.profile = await this.ensureProfile(data.user);
    return this.profile;
  },

  async signIn(email, password) {
    if (this.offline) throw new Error('离线模式不支持登录');
    // 首选：后端登录（服务端校验密码后签发会话，不依赖 Email 登录开关）。
    // 纯静态部署（无 Functions）时该请求可能 404 或被 SPA 回退成 HTML，
    // JSON 解析失败一律回退直连登录，绝不能让登录中断。
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      let d = null;
      try { d = await r.json(); } catch { d = null; } // 返回的是 HTML 而非 JSON
      if (d && d.ok && d.session) {
        const { data, error } = await this.client.auth.setSession({
          access_token: d.session.access_token,
          refresh_token: d.session.refresh_token
        });
        if (error) throw new Error(this.errText(error));
        this.user = data.user;
        try { this.profile = await this.ensureProfile(this.user); }
        catch (pe) { this.profileError = pe.message; }
        return this.profile;
      }
      // 后端存在但明确报错（密码错误 / 未配置密钥等）→ 直接给出中文提示
      if (d && d.error) throw new Error(d.error);
      // d 为 null（HTML 回退 / 404）→ 继续走下面的直连登录
    } catch (e) {
      if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
    }
    // 回退：客户端直连密码登录（需项目开启 Email 登录）
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(this.errText(error));
    this.user = data.user;
    this.profile = await this.ensureProfile(data.user);
    return this.profile;
  },

  async ensureProfile(user) {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) {
      if (error.code === '42501') throw new Error('数据库缺少表授权：请在 Supabase SQL Editor 执行 supabase/fix-grants.sql');
      if (error.code === '42P01') throw new Error('数据表不存在：请执行 supabase/schema.sql');
      throw new Error(this.errText(error));
    }
    if (data) return data;
    const username = user.user_metadata?.username || user.email?.split('@')[0] || '玩家';
    const ins = await this.client.from('profiles')
      .insert({ id: user.id, username, invite_code: this.genInviteCode(), chips: 100 });
    if (ins.error && ins.error.code === '42501') {
      throw new Error('数据库缺少表授权：请在 Supabase SQL Editor 执行 supabase/fix-grants.sql');
    }
    const { data: p2 } = await this.client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    return p2;
  },

  async signOut() {
    if (!this.offline) await this.client.auth.signOut();
    this.user = null;
    this.profile = null;
  },

  /* ---------- 房间 ---------- */
  genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  },

  async createRoom(rules) {
    const code = this.genRoomCode();
    const { data: room, error } = await this.client.from('rooms').insert({
      code, host_id: this.user.id, rules, status: 'waiting'
    }).select().single();
    if (error) throw error;
    await this.client.from('room_players').insert({
      room_id: room.id, user_id: this.user.id, username: this.profile.username, seat: 0, agreed: false
    });
    this.room = room;
    await this.subscribeRoom(room.id);
    return room;
  },

  async joinRoom(code) {
    const { data: room, error } = await this.client.from('rooms')
      .select('*').eq('code', code.toUpperCase()).maybeSingle();
    if (error) throw new Error(this.errText(error));
    if (!room) throw new Error('房间不存在，请检查房间号');
    if (room.status !== 'waiting') throw new Error('该房间已开局，无法加入');
    const { data: players } = await this.client.from('room_players').select('*').eq('room_id', room.id);
    if (players.length >= 4) throw new Error('房间已满（4 人）');
    if (players.some(p => p.user_id === this.user.id)) {
      this.room = room;
      await this.subscribeRoom(room.id);
      return room;
    }
    const usedSeats = players.map(p => p.seat);
    let seat = 0;
    while (usedSeats.includes(seat)) seat++;
    await this.client.from('room_players').insert({
      room_id: room.id, user_id: this.user.id, username: this.profile.username, seat, agreed: false
    });
    this.room = room;
    await this.subscribeRoom(room.id);
    this.send('chat', { sys: true, text: `${this.profile.username} 加入了房间` });
    return room;
  },

  async fetchRoomPlayers() {
    if (!this.room) return [];
    const { data } = await this.client.from('room_players')
      .select('*').eq('room_id', this.room.id).order('seat');
    return data || [];
  },

  async agreeRules() {
    if (!this.room || this.offline) return;
    await this.client.from('room_players')
      .update({ agreed: true }).eq('room_id', this.room.id).eq('user_id', this.user.id);
    this.send('chat', { sys: true, text: `${this.profile.username} 已同意规则` });
  },

  async leaveRoom() {
    if (!this.room) return;
    if (!this.offline && this.user) {
      await this.client.from('room_players')
        .delete().eq('room_id', this.room.id).eq('user_id', this.user.id);
    }
    if (this.channel) { this.channel.unsubscribe(); this.channel = null; }
    this.room = null;
  },

  async addBotPlayer() {
    if (!this.room) return;
    const players = await this.fetchRoomPlayers();
    const usedSeats = players.map(p => p.seat);
    let seat = 0;
    while (usedSeats.includes(seat)) seat++;
    await this.client.from('room_players').insert({
      room_id: this.room.id, user_id: 'bot-' + seat, username: BOT_NAMES[seat % 3], seat, agreed: true, is_bot: true
    });
  },

  /* ---------- Realtime 通道 ---------- */
  async subscribeRoom(roomId) {
    if (this.channel) this.channel.unsubscribe();
    this.channel = this.client.channel('room:' + roomId, { config: { broadcast: { self: false } } });
    this.channel.on('broadcast', { event: 'game' }, ({ payload }) => {
      if (this.onMessage) this.onMessage(payload);
    });
    await this.channel.subscribe();
  },

  send(type, data) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event: 'game', payload: { type, ...data } });
  },

  /* ---------- 持久化 ---------- */
  async saveResults(roomId, roundNo, result, names) {
    if (this.offline || !this.client) return;
    const rows = [];
    [0, 1, 2, 3].forEach(seat => {
      const uid = names[seat];
      rows.push({
        room_id: roomId, round_no: roundNo, seat,
        player: uid,
        delta: result.deltas[seat],
        detail: { reason: result.reason, winners: result.winners }
      });
    });
    await this.client.from('game_results').insert(rows);
  },

  async saveChat(roomId, username, text) {
    if (this.offline || !this.client || !roomId) return;
    try { await this.client.from('chat_messages').insert({ room_id: roomId, username, text }); } catch (e) { /* ignore */ }
  },

  async loadChat(roomId) {
    if (this.offline || !roomId) return [];
    const { data } = await this.client.from('chat_messages')
      .select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(100);
    return data || [];
  },

  async loadMyResults() {
    if (this.offline || !this.profile) return [];
    try {
      const { data, error } = await this.client.from('game_results')
        .select('*').eq('player', this.profile.id).order('created_at', { ascending: false }).limit(50);
      if (error) return [];
      return data || [];
    } catch { return []; }
  }
};
