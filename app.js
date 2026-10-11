(() => {
  'use strict';
  const ERAS = [
    ['선사·고대', ['선사', '고조선', '부여', '고구려', '옥저', '동예', '삼한', '백제', '가야', '신라']],
    ['남북국·고려', ['통일신라', '발해', '후삼국', '고려']],
    ['조선', ['조선']],
    ['근현대', ['개항기', '일제강점기', '현대']],
    ['기타', ['기타']],
  ];
  const COUNTRIES = ERAS.flatMap(e => e[1]);
  const CIRCLE = ['①', '②', '③', '④', '⑤'];
  const exams = HQ.exams;
  const rounds = Object.keys(exams).map(Number).sort((a, b) => a - b);
  const app = document.getElementById('app');

  const store = {
    get(k, d) { try { const v = localStorage.getItem('hq:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) {
      // 풀이 기록(답·채점·필기)이 바뀌면 바뀐 문항만 클라우드에 알린다
      const m = /^(ans|graded):(\d+)$/.exec(k);
      if (m || k === 'notes') {
        const old = store.get(k, {}) || {}, keys = new Set([...Object.keys(old), ...Object.keys(v || {})]);
        const diff = [...keys].filter(x => old[x] !== (v || {})[x]);
        if (m) diff.length && HQCloud.changed(m[2], diff);
        else diff.forEach(x => { const [r, q] = x.split('-'); HQCloud.changed(r, [q]); });
      }
      try { localStorage.setItem('hq:' + k, JSON.stringify(v)); } catch {}
    },
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  // 게시용 번들(dist)에서는 이미지가 HQ.imgs에 data URI로 들어 있다
  const imgSrc = p => (HQ.imgs && HQ.imgs[p]) || p;
  const WIDE = matchMedia('(min-width: 1000px)');
  const norm = s => String(s || '').replace(/[\s.,·'"‘’“”「」『』()\[\]]/g, '');

  const state = {
    view: store.get('view', 'round'),
    round: store.get('round', rounds[rounds.length - 1]),
    mode: store.get('mode', 'solve'),
    country: store.get('country', '고구려'),
    sort: store.get('sort', 'freq'),
    query: '',
  };
  if (!exams[state.round]) state.round = rounds[rounds.length - 1];

  /* ---------- 공통: 선지 태그 ---------- */
  function tagsHTML(c) {
    const t = [];
    if (c.c) t.push(`<span class="tag c">${esc(c.c)}</span>`);
    if (c.k) t.push(`<span class="tag">${esc(c.k)}</span>`);
    if (c.p && c.p !== c.k) t.push(`<span class="tag">${esc(c.p)}</span>`);
    return t.length ? `<div class="tags">${t.join('')}</div>` : '';
  }

  /* ---------- 필기 ---------- */
  // 모든 필기는 한 객체 {"60-5": "내용"} 로 저장해 백업·복원이 쉽게 한다
  const notes = {
    all: () => store.get('notes', {}),
    get: (r, n) => notes.all()[r + '-' + n] || '',
    set(r, n, v) { const a = notes.all(); v.trim() ? a[r + '-' + n] = v : delete a[r + '-' + n]; store.set('notes', a); },
  };

  /* ---------- 회차별 풀이 ---------- */
  function answersKey(r) { return 'ans:' + r; }
  // 답을 고르는 것과 채점은 따로: 채점한 문항만 정답·해설이 보인다
  function gradedKey(r) { return 'graded:' + r; }

  function renderRound() {
    const ex = exams[state.round];
    const picks = store.get(answersKey(state.round), {});
    app.innerHTML = '';
    const col = el('<div class="col col-round"></div>');
    col.append(el(`<div class="rounds" role="group" aria-label="회차 선택">${rounds.map(r =>
      `<button data-r="${r}" aria-pressed="${r === state.round}">${r}회</button>`).join('')}</div>`));

    const tb = el(`<div class="toolbar">
      <div class="seg" role="group" aria-label="보기 방식">
        <button data-m="solve" aria-pressed="${state.mode === 'solve'}">풀기</button>
        <button data-m="review" aria-pressed="${state.mode === 'review'}">해설</button>
      </div>
      <span class="score" id="score"></span>
      <span class="tb-right">
        <label class="switch"><input type="checkbox" id="onlynotes" role="switch"${state.onlyNotes ? ' checked' : ''}><span class="switch-ui" aria-hidden="true"></span>필기한 문항만</label>
        <button class="tb-btn" id="reset">풀이 초기화</button>
      </span>
      <!-- 필기 내보내기/불러오기: 위치를 정할 때까지 숨겨 둔다 -->
      <span class="memo-tools" hidden>
        <button class="linkbtn" id="nexport">필기 내보내기</button>
        <label class="linkbtn" for="nimport">필기 불러오기</label><input type="file" id="nimport" accept="application/json" hidden>
      </span>
    </div>`);
    col.append(tb);
    const nav = el('<div class="qnav" id="qnav" aria-label="문항 이동"></div>');
    col.append(nav);
    // 모바일: 번호판은 숨겨 두고 왼쪽 아래 버튼으로 아래에서 꺼내 본다(PC에서는 CSS로 감춤)
    const fab = el('<button class="qnav-fab" aria-controls="qnav" aria-expanded="false"><b class="qnav-cur">1</b><span>/ ' + ex.questions.length + '</span></button>');
    const backdrop = el('<div class="qnav-backdrop" hidden></div>');
    col.append(fab, backdrop);
    fab.addEventListener('click', () => toggleSheet(!nav.classList.contains('open')));
    backdrop.addEventListener('click', () => toggleSheet(false));

    const shown = state.onlyNotes ? ex.questions.filter(q => notes.get(state.round, q.n)) : ex.questions;
    shown.forEach(q => col.append(questionCard(q, picks)));
    if (!shown.length) col.append(el(`<div class="empty">${ex.round}회에는 아직 필기한 문항이 없습니다.</div>`));
    app.append(col);

    col.querySelector('.rounds').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.round = +b.dataset.r; store.set('round', state.round); renderRound(); window.scrollTo(0, 0);
    });
    tb.querySelector('.seg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.mode = b.dataset.m; store.set('mode', state.mode); renderRound();
    });
    tb.querySelector('#reset').addEventListener('click', () => confirmReset(ex));
    if (state.mode === 'solve') col.append(el('<button class="grade-all" id="gradeall">채점하기</button>'));
    const ga = col.querySelector('#gradeall');
    ga && ga.addEventListener('click', () => {
      const g = {}; ex.questions.forEach(q => g[q.n] = 1);
      store.set(gradedKey(state.round), g);
      const y = window.scrollY; renderRound(); window.scrollTo(0, y);
    });
    tb.querySelector('#onlynotes').addEventListener('change', e => { state.onlyNotes = e.target.checked; renderRound(); });
    tb.querySelector('#nexport').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(notes.all(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '한능검-필기.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    tb.querySelector('#nimport').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const add = JSON.parse(await f.text());
        // 같은 문항에 필기가 이미 있으면 불러온 내용을 아래에 덧붙인다
        const cur = notes.all();
        for (const [k, v] of Object.entries(add)) if (typeof v === 'string' && v.trim()) cur[k] = cur[k] && cur[k] !== v ? cur[k] + '\n' + v : v;
        store.set('notes', cur); renderRound();
      } catch { alertBar('필기 파일을 읽지 못했습니다. 내보내기로 만든 .json 파일인지 확인해 주세요.'); }
    });
    watchCurrent();
    const curBtn = col.querySelector(`.rounds button[data-r="${state.round}"]`);
    curBtn && curBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
    updateScore();
  }

  // 풀이 초기화 확인 창: 필기는 함께 지울지 고른다(기본은 남김)
  function confirmReset(ex) {
    const r = ex.round, mine = Object.keys(notes.all()).filter(k => k.startsWith(r + '-'));
    const m = el(`<div class="modal" id="reset-modal">
      <div class="modal-card modal-sm" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">${r}회 풀이 초기화</h2>
        <p class="modal-lead">고른 답과 채점 기록을 모두 지워요.</p>
        ${mine.length ? `<label class="check"><input type="checkbox" id="reset-notes"><span>필기 ${mine.length}개도 함께 지우기</span></label>` : ''}
        <div class="modal-actions">
          <button class="tb-btn" data-act="cancel">취소</button>
          <button class="btn-danger" data-act="ok">초기화</button>
        </div>
      </div>
    </div>`);
    document.body.append(m);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    m.querySelector('[data-act="cancel"]').focus();
    m.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (e.target === m || act === 'cancel') return close();
      if (act !== 'ok') return;
      store.set(answersKey(r), {}); store.set(gradedKey(r), {});
      if (m.querySelector('#reset-notes')?.checked) {
        const all = notes.all(); mine.forEach(k => delete all[k]); store.set('notes', all);
      }
      close(); renderRound();
    });
  }

  function isCorrect(q, pick) { return !q.a.length || q.a.includes(pick); }
  // 채점 표시: 맞으면 동그라미(mk-o), 틀리면 빗금(mk-x). 색연필 질감은 #pencil 필터
  const markClass = (q, pick) => pick != null && isCorrect(q, pick) ? ' mk-o' : ' mk-x';
  const MARK = `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true">
    <g filter="url(#pencil)">
      <path class="ring" pathLength="1" d="M80 24C66 8 30 9 17 31C5 52 17 83 47 86C77 89 95 64 87 39C83 27 71 17 52 14"/>
      <path class="ring p2" pathLength="1" d="M76 20C60 9 27 13 15 36C7 56 22 82 50 83C78 84 92 58 84 35"/>
      <path class="slash" pathLength="1" d="M22 88C38 64 60 38 88 10"/>
      <path class="slash p2" pathLength="1" d="M26 90C42 66 63 40 90 14"/>
    </g></svg>`;

  function questionCard(q, picks) {
    const review = state.mode === 'review';
    const pick = picks[q.n];
    const done = review || !!store.get(gradedKey(state.round), {})[q.n];
    const card = el(`<article class="q${done ? ' done' : ''}${done && !review ? markClass(q, pick) : ''}" id="q${q.n}"></article>`);
    const head = `<div class="qhead"><span class="qnum">${review ? `${q.n}.` : `<button class="qgrade-num" title="${q.n}번 채점" aria-label="${q.n}번 채점">${q.n}.</button>${MARK}`}</span><span class="qtext">${esc(q.q)}</span><span class="pts">${q.pt ? q.pt + '점' : ''}</span></div>`;
    // 이미지에 발문·배점이 함께 들어 있으므로, 이미지가 있으면 텍스트 발문은 생략
    let body = q.img ? '' : head;
    const gbtn = review ? '' : `<div class="qgrade-box"><button class="qgrade" title="${q.n}번 채점" aria-label="${q.n}번 채점"></button>${MARK}</div>`;
    if (q.img) body += `<div class="qimg"><img loading="lazy" src="${esc(imgSrc(q.img))}" alt="${q.n}번. ${esc(q.q)}">${gbtn}</div>`;
    else if (q.material) body += `<div class="clue" style="background:var(--bg)">${esc(q.material)}</div>`;
    if (q.src) body += `<div class="note">원본 문제지에 이 문항이 빠져 있어, 공개 기출 자료를 검색해 텍스트로 복원했습니다.</div>`;
    if (q.missing) body += `<div class="note">원본 문제지에 이 문항이 빠져 있습니다.</div>`;
    if (q.note) body += `<div class="note">${esc(q.note)}</div>`;
    const reveal = `<div class="clue reveal"${done ? '' : ' hidden'}><b>단서</b>${esc(q.clue || '')}${q.target ? `<div class="target">정답 대상 · ${esc([q.target.c, q.target.k, q.target.p].filter(Boolean).join(' · '))}</div>` : ''}</div>`;
    body += reveal;
    body += `<ol class="choices">${q.choices.map((c, i) => {
      const n = i + 1, ok = q.a.includes(n);
      const cls = ['ch', ok ? 'correct' : 'wrong', pick === n ? 'sel' : '', review ? 'open' : ''].join(' ');
      const verdict = done ? `<span class="verdict ${ok ? 'o' : 'x'}">${ok ? '정답' : '오답'}</span>` : '';
      return `<li class="${cls}" data-i="${n}">
        <div class="row">
          <button class="pick" aria-label="${n}번 선택">${n}</button>
          <button class="ctext" aria-expanded="${review}"><span class="tx">${c.ph
            ? `<img class="cthumb" loading="lazy" src="${esc(imgSrc(c.ph))}" alt="${n}번 사진"><span class="phname">${esc(photoName(c.t))}</span>`
            : esc(c.t)}</span><span class="caret" aria-hidden="true">▶</span></button>
        </div>
        <div class="exp">${tagsHTML(c)}<span class="vd">${verdict}</span>${esc(c.e)}</div>
      </li>`;
    }).join('')}</ol>`;
    if (done && !review && pick == null) body += `<div class="note">답을 고르지 않은 문항입니다.</div>`;
    // 넓은 화면: 문항 오른쪽에 필기란이 항상 열려 있음 / 좁은 화면: 문항 아래에 접힌 채로 시작
    const memo = notes.get(state.round, q.n);
    card.innerHTML = `<div class="qmain">${body}</div>
      <aside class="memo${memo ? ' has' : ''}">
        <button class="memo-btn" aria-expanded="false">필기하기</button>
        <textarea class="memo-ta" aria-label="${q.n}번 필기" placeholder="메모하기…">${esc(memo)}</textarea>
      </aside>`;
    const box = card.querySelector('.memo'), ta = card.querySelector('.memo-ta'), mb = card.querySelector('.memo-btn');
    const grow = () => { if (WIDE.matches) { ta.style.height = ''; return; } ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
    let t;
    ta.addEventListener('input', () => {
      grow(); clearTimeout(t);
      t = setTimeout(() => {
        const has = !!ta.value.trim();
        notes.set(state.round, q.n, ta.value);
        box.classList.toggle('has', has);
      }, 300);
    });
    mb.addEventListener('click', () => {
      const open = box.classList.toggle('open'); mb.setAttribute('aria-expanded', open);
      mb.textContent = open ? '필기접기' : '필기하기';
      if (open) { grow(); ta.focus(); }
    });

    const grade = () => {
      const g = store.get(gradedKey(state.round), {}); g[q.n] = 1; store.set(gradedKey(state.round), g);
      card.classList.add('done', markClass(q, store.get(answersKey(state.round), {})[q.n]).trim());
      card.querySelectorAll('.ch').forEach(x => {
        const ok = x.classList.contains('correct');
        x.querySelector('.vd').innerHTML = `<span class="verdict ${ok ? 'o' : 'x'}">${ok ? '정답' : '오답'}</span>`;
      });
      card.querySelector('.reveal').hidden = false;
      updateScore();
    };
    card.addEventListener('click', e => {
      if (e.target.closest('.qgrade, .qgrade-num')) {
        if (card.classList.contains('done')) return;
        if (store.get(answersKey(state.round), {})[q.n] == null) return alertBar('답을 먼저 골라 주세요.');
        return grade();
      }
      const li = e.target.closest('.ch'); if (!li) return;
      const graded = card.classList.contains('done');
      // 채점 전에는 번호든 문장이든 누르면 답 선택, 채점 후에는 문장을 누르면 해설
      if (e.target.closest('.pick') || (!graded && e.target.closest('.ctext'))) {
        const picks = store.get(answersKey(state.round), {});
        const n = +li.dataset.i;
        picks[q.n] = n; store.set(answersKey(state.round), picks);
        card.querySelectorAll('.ch').forEach(x => x.classList.toggle('sel', +x.dataset.i === n));
        updateScore();
      } else if (e.target.closest('.ctext')) {
        const open = li.classList.toggle('open');
        li.querySelector('.ctext').setAttribute('aria-expanded', open);
      }
    });
    return card;
  }

  function alertBar(msg) {
    const b = el(`<div class="toast" role="status">${esc(msg)}</div>`);
    document.body.append(b); setTimeout(() => b.remove(), 4000);
  }

  // 화면 위쪽에 걸친 문항을 번호판에 '지금 보는 문항'으로 표시
  let curQ = 0, spy;
  function watchCurrent() {
    spy && spy.disconnect();
    spy = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) {
        curQ = +e.target.id.slice(1);
        app.querySelectorAll('.qnav button').forEach(b => b.classList.toggle('cur', +b.dataset.n === curQ));
        const c = app.querySelector('.qnav-cur'); if (c) c.textContent = curQ;
      }
    }, { rootMargin: '-35% 0px -60% 0px' });
    app.querySelectorAll('.q').forEach(c => spy.observe(c));
  }

  function toggleSheet(open) {
    const nav = app.querySelector('.qnav'), fab = app.querySelector('.qnav-fab'), bd = app.querySelector('.qnav-backdrop');
    if (!nav) return;
    nav.classList.toggle('open', open); bd.hidden = !open; fab.setAttribute('aria-expanded', open);
  }

  function updateScore() {
    const ex = exams[state.round];
    const picks = store.get(answersKey(state.round), {});
    const graded = state.mode === 'review' ? {} : store.get(gradedKey(state.round), {});
    let got = 0, nGraded = 0, right = 0, picked = 0;
    const nav = app.querySelector('.qnav');
    const cells = ex.questions.map(q => {
      const p = picks[q.n]; let cls = '';
      if (p != null) picked++;
      if (graded[q.n]) {
        nGraded++;
        if (p != null && isCorrect(q, p)) { right++; got += q.pt || 0; cls = 'ok'; } else cls = 'bad';
      } else if (p != null) cls = 'picked';
      if (q.n === curQ) cls += ' cur';
      return `<button class="${cls}" data-n="${q.n}" aria-label="${q.n}번으로 이동">${q.n}</button>`;
    }).join('');
    nav.innerHTML = `<div class="qnav-head"><span>${ex.round}회</span><span class="qnav-prog">${picked}<i>/</i>${ex.questions.length}</span></div><div class="qnav-grid">${cells}</div>`;
    nav.onclick = e => {
      const b = e.target.closest('button'); const t = b && document.getElementById('q' + b.dataset.n);
      if (!t) return;
      toggleSheet(false); t.scrollIntoView({ behavior: 'smooth' });
    };
    const s = app.querySelector('#score');
    if (state.mode === 'review') s.textContent = '';
    else if (nGraded) s.innerHTML = `<b>${got}</b>점 · 채점 ${nGraded}문항 중 ${right}개 정답${picked > nGraded ? ` · 미채점 선택 ${Object.keys(picks).filter(n => !graded[n]).length}` : ''}`;
    else s.textContent = picked ? `${picked}문항 답 선택 · 채점 전` : '';
  }

  /* ---------- 나라별 선지 ---------- */
  const GALLERY = '__gallery';
  const REP = HQ.rep || {};
  const isOrdering = t => /^[\s()가나다라마바ㄱㄴㄷㄹ,\-–→]+$/.test(t);
  const isPhoto = c => !!c.ph || /^\[(사진|그림)\]/.test(c.t);
  // (가), ㉠, 'ㄱ.' 같은 지시 표지를 떼고 선지 문장만 남긴다
  const clean = t => String(t).replace(/^\s*(?:\([가-하]\)|[㉠-㉦]|[ㄱ-ㅎ]\.)\s*(?:[-–:·,]|은|는|이|가)?\s*/, '').trim();
  const photoName = t => String(t).replace(/^\[(사진|그림)\]\s*/, '').replace(/\s*\(추정\)/g, '').trim();

  let index = null;
  // 같은 개념(g)의 선지를 하나로 묶는다. g가 없으면 문장 자체로 묶는다.
  function buildIndex() {
    const map = new Map();
    for (const r of rounds) for (const q of exams[r].questions) q.choices.forEach((c, i) => {
      if (!c.c || !c.t || c.x || isOrdering(c.t)) return;
      const photo = isPhoto(c);
      const key = c.c + '|' + (c.g ? 'g:' + norm(c.g) : norm(photo ? photoName(c.t) : clean(c.t)));
      let it = map.get(key);
      if (!it) { it = { g: c.g || '', c: c.c, k: c.k, p: c.p, e: c.e || '', photo, phs: [], variants: new Map(), refs: [] }; map.set(key, it); }
      if (!it.k && c.k) it.k = c.k;
      if (c.e && c.e.length > it.e.length) it.e = c.e;
      if (c.ph) it.phs.push(c.ph);
      const v = photo ? photoName(c.t) : clean(c.t);
      it.variants.set(v, (it.variants.get(v) || 0) + 1);
      it.refs.push({ r, n: q.n, i: i + 1, ans: q.a.includes(i + 1) });
    });
    index = [...map.values()].map(it => {
      const vs = [...it.variants.entries()].sort((a, b) => b[1] - a[1]).map(v => v[0]);
      const rep = (it.g && REP[it.c + '|' + it.g]) || vs[0];
      return { ...it, t: it.photo ? photoName(rep) : clean(rep), others: vs.filter(v => v !== rep && v !== clean(rep)) };
    });
  }

  function groupName(it) { return it.k || it.p || '기타'; }

  function refsHTML(it) {
    return `<div class="refs">${it.refs.map(r => `<button class="${r.ans ? 'ans' : ''}" data-r="${r.r}" data-n="${r.n}" title="${r.ans ? '정답 선지로 출제' : '오답 선지로 출제'}">${r.r}회 ${r.n}번 ${CIRCLE[r.i - 1]}${r.ans ? ' 정답' : ''}</button>`).join('')}</div>`;
  }
  function itemHTML(it) {
    const f = it.refs.length;
    return `<div class="item ch">
      <div class="row">
        <span class="freq${f >= 3 ? ' hot' : ''}" title="${f}회 출제">×${f}</span>
        <button class="ctext" aria-expanded="false"><span class="tx">${esc(it.t)}</span><span class="caret" aria-hidden="true">▶</span></button>
      </div>
      <div class="exp">${tagsHTML(it)}${esc(it.e)}
        ${it.others.length ? `<div class="variants"><span>같은 개념의 다른 선지</span>${it.others.map(v => `<div>${esc(v)}</div>`).join('')}</div>` : ''}
        ${refsHTML(it)}
      </div>
    </div>`;
  }
  function photoHTML(it) {
    const f = it.refs.length, src = it.phs[0];
    return `<figure class="ph ch">
      <button class="ctext ph-btn" aria-expanded="false">
        ${src ? `<img loading="lazy" src="${esc(imgSrc(src))}" alt="${esc(it.t)}">` : '<span class="ph-none">사진 없음</span>'}
        <figcaption><span class="freq${f >= 3 ? ' hot' : ''}">×${f}</span>${esc(it.t)}</figcaption>
      </button>
      <div class="exp">${tagsHTML(it)}${esc(it.e)}${refsHTML(it)}</div>
    </figure>`;
  }
  const byFreq = (a, b) => b.refs.length - a.refs.length || a.t.localeCompare(b.t, 'ko');
  const galleryHTML = items => `<div class="gallery">${items.sort(byFreq).map(photoHTML).join('')}</div>`;

  function renderCountry() {
    if (!index) buildIndex();
    app.innerHTML = '';
    const counts = {}, pcount = index.filter(it => it.photo).length;
    index.forEach(it => { if (!it.photo) counts[it.c] = (counts[it.c] || 0) + 1; });
    const has = c => counts[c] || index.some(it => it.photo && it.c === c);
    const wrap = el('<div class="cview"></div>');
    const side = el(`<nav class="clist" aria-label="나라 선택">
      <button data-c="${GALLERY}" aria-pressed="${state.country === GALLERY}">문화유산 갤러리<span>${pcount}</span></button>
      ${ERAS.map(([era, cs]) => `<div class="era">${era}</div>` + cs.filter(has).map(c =>
        `<button data-c="${c}" aria-pressed="${c === state.country}">${c}<span>${counts[c] || 0}</span></button>`).join('')).join('')}</nav>`);
    const mainCol = el('<section style="min-width:0"></section>');
    const sel = el(`<select class="mcsel" id="csel" aria-label="나라 선택">
      <option value="${GALLERY}"${state.country === GALLERY ? ' selected' : ''}>문화유산 갤러리 (${pcount})</option>
      ${COUNTRIES.filter(has).map(c => `<option value="${c}"${c === state.country ? ' selected' : ''}>${c} (${counts[c] || 0})</option>`).join('')}</select>`);
    mainCol.append(sel);
    mainCol.append(el(`<div class="toolbar" style="margin-top:0">
      <input class="search" id="q" type="search" placeholder="선지 검색 (예: 22담로, 정사암, 별무반)" value="${esc(state.query)}">
      <div class="seg" role="group" aria-label="정렬">
        <button data-s="freq" aria-pressed="${state.sort === 'freq'}">빈출순</button>
        <button data-s="group" aria-pressed="${state.sort === 'group'}">왕·인물별</button>
      </div>
    </div>`));
    const list = el('<div id="clist"></div>');
    mainCol.append(list);
    wrap.append(side, mainCol);
    app.append(wrap);

    if (state.country !== GALLERY && !has(state.country)) state.country = COUNTRIES.find(has);
    side.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setCountry(b.dataset.c); });
    sel.addEventListener('change', () => setCountry(sel.value));
    mainCol.querySelector('.seg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.sort = b.dataset.s; store.set('sort', state.sort);
      mainCol.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
      drawList();
    });
    const qi = mainCol.querySelector('#q');
    qi.addEventListener('input', () => { state.query = qi.value; drawList(); });

    function setCountry(c) {
      state.country = c; store.set('country', c);
      side.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.c === c));
      sel.value = c; drawList(); window.scrollTo(0, 0);
    }

    function textList(items, prefixCountry) {
      if (state.sort === 'freq') return items.sort(byFreq).map(itemHTML).join('');
      const groups = new Map();
      items.forEach(it => { const g = (prefixCountry ? it.c + ' · ' : '') + groupName(it); (groups.get(g) || groups.set(g, []).get(g)).push(it); });
      return [...groups.entries()].map(([g, arr]) => [g, arr.sort(byFreq), arr.reduce((s, x) => s + x.refs.length, 0)])
        .sort((a, b) => b[2] - a[2])
        .map(([g, arr, total]) => `<div class="grp"><h3>${esc(g)}<span>개념 ${arr.length} · 출제 ${total}회</span></h3>${arr.map(itemHTML).join('')}</div>`).join('');
    }

    function drawList() {
      const qv = norm(state.query);
      let html;
      if (qv) {
        const hit = index.filter(it => norm(it.g + it.t + it.others.join('') + it.k + it.p + it.e).includes(qv));
        const ph = hit.filter(it => it.photo), tx = hit.filter(it => !it.photo);
        html = `<div class="chead"><h2>“${esc(state.query)}” 검색 결과</h2><p>개념 ${tx.length}개 · 사진 ${ph.length}개</p></div>`;
        if (ph.length) html += `<div class="grp"><h3>문화유산 사진</h3>${galleryHTML(ph)}</div>`;
        html += tx.length ? textList(tx, true) : (ph.length ? '' : '<div class="empty">해당하는 선지가 없습니다.</div>');
      } else if (state.country === GALLERY) {
        const ph = index.filter(it => it.photo);
        html = `<div class="chead"><h2>문화유산 갤러리</h2><p>사진·그림 선지 ${ph.length}점</p></div>`;
        html += COUNTRIES.map(c => { const arr = ph.filter(it => it.c === c); return arr.length ? `<div class="grp"><h3>${c}<span>${arr.length}점</span></h3>${galleryHTML(arr)}</div>` : ''; }).join('');
      } else {
        const all = index.filter(it => it.c === state.country);
        const ph = all.filter(it => it.photo), tx = all.filter(it => !it.photo);
        html = `<div class="chead"><h2>${esc(state.country)}</h2><p>개념 ${tx.length}개${ph.length ? ` · 사진 ${ph.length}점` : ''}</p></div>`;
        if (ph.length) html += `<div class="grp"><h3>문화유산 사진<span>${ph.length}점</span></h3>${galleryHTML(ph)}</div>`;
        html += tx.length ? textList(tx, false) : '';
      }
      list.innerHTML = html;
    }
    list.addEventListener('click', e => {
      const ref = e.target.closest('.refs button');
      if (ref) {
        state.round = +ref.dataset.r; state.mode = 'review'; store.set('round', state.round); store.set('mode', 'review');
        go('round'); requestAnimationFrame(() => document.getElementById('q' + ref.dataset.n)?.scrollIntoView());
        return;
      }
      const t = e.target.closest('.ctext');
      if (t) { const li = t.closest('.ch'); const o = li.classList.toggle('open'); t.setAttribute('aria-expanded', o); }
    });
    drawList();
  }

  /* ---------- 탭 ---------- */
  const tabR = document.getElementById('tab-round'), tabC = document.getElementById('tab-country');
  function go(v) {
    state.view = v; store.set('view', v);
    tabR.setAttribute('aria-selected', v === 'round'); tabC.setAttribute('aria-selected', v === 'country');
    v === 'round' ? renderRound() : renderCountry();
    // 로그인 직후 주소에 붙어 오는 정보(#access_token 등)는 건드리지 않는다
    if (location.hash !== '#' + v && !/access_token|error_description/.test(location.hash)) history.replaceState(null, '', '#' + v);
  }
  tabR.onclick = () => { go('round'); window.scrollTo(0, 0); };
  tabC.onclick = () => { go('country'); window.scrollTo(0, 0); };
  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if ((v === 'round' || v === 'country') && v !== state.view) go(v);
  });
  const h = location.hash.slice(1);
  go(h === 'country' || h === 'round' ? h : state.view);
  // 로그인 후 서버 기록을 받아오면 지금 화면을 다시 그린다
  HQCloud.init({ onPulled: () => { const y = scrollY; go(state.view); scrollTo(0, y); } });
})();
