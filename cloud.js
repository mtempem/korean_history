// Supabase 동기화 (선택 기능). config.js 에 URL·키가 있을 때만 켜진다.
// 화면은 언제나 localStorage를 읽고 쓰고, 로그인하면 바뀐 문항만 progress 테이블에 올린다.
window.HQCloud = (() => {
  'use strict';
  const cfg = window.HQ_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  let sb = null, user = null, onPulled = () => {}, timer = null, state = 'off';
  const queue = new Map();
  const noteQueue = new Set();  // 필기장(notebook 테이블)에 올릴 필기 id
  let notebookReady = true;     // notebook 테이블이 아직 없으면 false (SQL 실행 전)

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

  // 필기장: 바뀐 필기만 올리고, 내용이 비면 지운다
  function noteChanged(id) {
    if (!user || !notebookReady) return;
    noteQueue.add(id);
    clearTimeout(timer); timer = setTimeout(flush, 700);
  }
  async function flushNotes() {
    const ids = [...noteQueue]; noteQueue.clear();
    if (!ids.length || !user || !notebookReady) return;
    const nb = ls('notebook') || {};
    const isEmpty = id => !(nb[id]?.body || '').replace(/<[^>]+>/g, '').trim();
    const full = ids.filter(id => !isEmpty(id)).map(id => ({ user_id: user.id, id, body: nb[id].body, updated_at: new Date(nb[id].at || Date.now()).toISOString() }));
    if (full.length) { const { error } = await sb.from('notebook').upsert(full); if (error) throw error; }
    for (const id of ids.filter(isEmpty)) {
      const { error } = await sb.from('notebook').delete().match({ user_id: user.id, id }); if (error) throw error;
    }
  }

  async function flush() {
    try { await flushNotes(); } catch (e) {
      if (e?.code === '42P01' || e?.code === 'PGRST205') notebookReady = false; else { console.error('[필기 동기화 실패]', e); status('error'); }
    }
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
    // 필기장: 서버 것을 반영하고, 이 브라우저에만 있던 필기는 올린다
    const r = await sb.from('notebook').select('id,body,updated_at');
    if (r.error) { notebookReady = false; console.info('[필기장] notebook 테이블이 없어 이 브라우저에만 저장해요. supabase/notebook.sql 을 실행하세요.'); }
    else {
      notebookReady = true;
      const nb = ls('notebook') || {}, remoteIds = new Set(r.data.map(x => x.id));
      for (const x of r.data) nb[x.id] = { ...nb[x.id], body: x.body, at: Date.parse(x.updated_at) };
      lsSet('notebook', nb);
      Object.keys(nb).filter(id => !remoteIds.has(id) && (nb[id].body || '').replace(/<[^>]+>/g, '').trim()).forEach(id => noteQueue.add(id));
    }
    queue.size || noteQueue.size ? flush() : status('saved');
    onPulled();
  }

  /* ---------- 상단 계정 영역 ---------- */
  // 평소에는 아무것도 표시하지 않고, 저장에 실패했을 때만 알린다
  const LABEL = { off: '', saving: '', saved: '', error: '저장 실패 · 다시 시도 중' };
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
        <button type="button" class="acct-google" id="acct-google"><svg class="g-logo" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg><span>Google로 계속하기</span></button>
        <p class="acct-msg" id="acct-msg" role="status"></p>
      </div>`;
    document.body.append(m);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('.modal-x')) close(); });
    const g = m.querySelector('#acct-google');
    g.focus();
    g.onclick = async () => {
      g.disabled = true;
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      if (error) { g.disabled = false; m.querySelector('#acct-msg').textContent = 'Google 로그인을 시작하지 못했어요: ' + error.message; }
    };
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
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
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

  return { init, changed, noteChanged, get enabled() { return enabled; } };
})();
