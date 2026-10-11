// Supabase 동기화 (선택 기능). config.js 에 URL·키가 있을 때만 켜진다.
// 화면은 언제나 localStorage를 읽고 쓰고, 로그인하면 바뀐 문항만 progress 테이블에 올린다.
window.HQCloud = (() => {
  'use strict';
  const cfg = window.HQ_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  let sb = null, user = null, onPulled = () => {}, timer = null, state = 'off';
  const queue = new Map();

  const ls = k => { try { return JSON.parse(localStorage.getItem('hq:' + k)); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem('hq:' + k, JSON.stringify(v)); } catch {} };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function rowFor(r, q) {
    const ans = ls('ans:' + r) || {}, gr = ls('graded:' + r) || {}, notes = ls('notes') || {};
    return { user_id: user.id, round: +r, q: +q, pick: ans[q] ?? null, graded: !!gr[q], note: notes[r + '-' + q] || null, updated_at: new Date().toISOString() };
  }
  const isEmpty = x => x.pick == null && !x.graded && !x.note;

  // app.js 가 기록을 바꿀 때마다 부른다
  function changed(r, qs) {
    if (!user) return;
    qs.forEach(q => queue.set(r + '-' + q, [r, q]));
    clearTimeout(timer); timer = setTimeout(flush, 700);
    status('saving');
  }

  async function flush() {
    const items = [...queue.values()]; queue.clear();
    if (!items.length || !user) return;
    const rows = items.map(([r, q]) => rowFor(r, q));
    try {
      const full = rows.filter(x => !isEmpty(x)), empty = rows.filter(isEmpty);
      if (full.length) { const { error } = await sb.from('progress').upsert(full); if (error) throw error; }
      for (const x of empty) {
        const { error } = await sb.from('progress').delete().match({ user_id: user.id, round: x.round, q: x.q });
        if (error) throw error;
      }
      status('saved');
    } catch (e) {
      console.error('[동기화 실패]', e);
      items.forEach(([r, q]) => queue.set(r + '-' + q, [r, q]));
      status('error');
    }
  }

  // 로그인 직후: 서버 기록을 이 브라우저에 반영하고, 로그인 전에 이 브라우저에만 쓴 기록은 올린다
  async function pull() {
    status('saving');
    const { data, error } = await sb.from('progress').select('round,q,pick,graded,note');
    if (error) { console.error('[불러오기 실패]', error); return status('error'); }
    const remote = new Set(data.map(d => d.round + '-' + d.q));
    const local = [];
    for (let i = 0; i < localStorage.length; i++) {
      const m = (localStorage.key(i) || '').match(/^hq:(ans|graded):(\d+)$/);
      if (m) Object.keys(ls(m[1] + ':' + m[2]) || {}).forEach(q => local.push([m[2], q]));
    }
    Object.keys(ls('notes') || {}).forEach(k => local.push(k.split('-')));
    const notes = ls('notes') || {}, byRound = {};
    for (const d of data) {
      const a = byRound[d.round] ??= { ans: ls('ans:' + d.round) || {}, gr: ls('graded:' + d.round) || {} };
      d.pick != null ? a.ans[d.q] = d.pick : delete a.ans[d.q];
      d.graded ? a.gr[d.q] = 1 : delete a.gr[d.q];
      d.note ? notes[d.round + '-' + d.q] = d.note : delete notes[d.round + '-' + d.q];
    }
    for (const [r, a] of Object.entries(byRound)) { lsSet('ans:' + r, a.ans); lsSet('graded:' + r, a.gr); }
    lsSet('notes', notes);
    local.filter(([r, q]) => !remote.has(r + '-' + q)).forEach(([r, q]) => queue.set(r + '-' + q, [r, q]));
    queue.size ? flush() : status('saved');
    onPulled();
  }

  /* ---------- 상단 계정 영역 ---------- */
  const LABEL = { off: '', saving: '저장 중…', saved: '동기화됨', error: '동기화 실패 · 다시 시도 중' };
  function status(s) { state = s; const el = document.querySelector('#acct .sync'); if (el) { el.textContent = LABEL[s]; el.dataset.s = s; } }

  function renderAcct() {
    const box = document.getElementById('acct'); if (!box) return;
    if (!user) {
      box.innerHTML = `<button class="acct-btn acct-save" id="acct-open">저장하기</button>`;
      box.querySelector('#acct-open').onclick = openLogin;
    } else {
      box.innerHTML = `<span class="sync" data-s="${state}">${LABEL[state]}</span>
        <button class="acct-btn" id="acct-out" title="${esc(user.email)}">로그아웃</button>`;
      box.querySelector('#acct-out').onclick = async () => {
        await flush();
        await sb.auth.signOut();
      };
    }
  }

  // 화면 가운데 로그인 안내 팝업
  function openLogin() {
    if (document.getElementById('login-modal')) return;
    const m = document.createElement('div');
    m.className = 'modal'; m.id = 'login-modal';
    const ck = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
    m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button class="modal-x" aria-label="닫기">×</button>
        <h2 id="login-title">풀이 기록 저장하기</h2>
        <p class="modal-lead">로그인하면 어느 기기에서든 이어서 풀 수 있어요.</p>
        <ul class="modal-list">
          <li>${ck}폰·PC에서 이어 풀기</li>
          <li>${ck}문제별 필기 보관</li>
          <li>${ck}지금까지 푼 기록도 함께 저장</li>
        </ul>
        <form id="acct-form">
          <p class="modal-note">비밀번호 없이, 메일로 받은 링크를 누르면 로그인돼요.</p>
          <input id="acct-email" type="email" required autocomplete="email" placeholder="example@gmail.com" aria-label="이메일 주소">
          <button type="submit" class="acct-primary">로그인 링크 받기</button>
          ${cfg.google ? '<button type="button" class="acct-google" id="acct-google">Google로 계속하기</button>' : ''}
          <p class="acct-msg" id="acct-msg" role="status"></p>
        </form>
      </div>`;
    document.body.append(m);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('.modal-x')) close(); });
    const form = m.querySelector('#acct-form');
    form.querySelector('input').focus();
    form.onsubmit = async e => {
      e.preventDefault();
      const msg = form.querySelector('#acct-msg'), email = form.querySelector('#acct-email').value.trim();
      msg.textContent = '보내는 중…';
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      msg.textContent = error ? '보내지 못했어요: ' + error.message : email + ' 로 로그인 링크를 보냈어요. 메일의 링크를 누르면 로그인돼요.';
    };
    const g = form.querySelector('#acct-google');
    if (g) g.onclick = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  }

  function loadLib() {
    return new Promise((ok, fail) => {
      if (window.supabase) return ok();
      const s = document.createElement('script');
      s.src = LIB; s.onload = ok; s.onerror = fail;
      document.head.append(s);
    });
  }

  async function init(opts) {
    onPulled = opts.onPulled || onPulled;
    if (!enabled) return;
    // file:// 에서는 로그인 링크가 돌아올 주소가 없으므로 동기화를 켜지 않는다
    if (location.protocol === 'file:') { console.info('[동기화] 웹 주소(http/https)로 열어야 로그인할 수 있어요.'); return; }
    try { await loadLib(); } catch { return console.error('[동기화] Supabase 라이브러리를 불러오지 못했어요.'); }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    document.getElementById('acct').hidden = false;
    sb.auth.onAuthStateChange((ev, session) => {
      const next = session?.user || null;
      const was = user; user = next;
      if (next && (!was || was.id !== next.id)) { document.getElementById('login-modal')?.remove(); renderAcct(); setTimeout(pull, 0); }
      if (!next) { state = 'off'; renderAcct(); }
    });
    const { data } = await sb.auth.getSession();
    if (!data.session) renderAcct();
    // 페이지를 떠나기 전에 남은 변경을 보낸다
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  return { init, changed, get enabled() { return enabled; } };
})();
