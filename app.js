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
    if (q.img) body += `<div class="qimg"><img loading="lazy" width="${q.iw || ''}" height="${q.ih || ''}" src="${esc(imgSrc(q.img))}" alt="${q.n}번. ${esc(q.q)}">${gbtn}</div>`;
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
            ? `<img class="cthumb" loading="lazy" width="${c.pw || ''}" height="${c.phh || ''}" src="${esc(imgSrc(c.ph))}" alt="${n}번 사진"><span class="phname">${esc(photoName(c.t))}</span>`
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

  // 문항으로 이동: 부드럽게 스크롤한 뒤, 도중에 위쪽 내용이 늘어나 덜 갔으면 한 번 더 맞춘다
  function goTo(card) {
    card.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      const want = parseFloat(getComputedStyle(card).scrollMarginTop) || 0;
      if (Math.abs(card.getBoundingClientRect().top - want) > 12) card.scrollIntoView();
    }, 700);
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
      toggleSheet(false); goTo(t);
    };
    const s = app.querySelector('#score');
    if (state.mode === 'review') s.textContent = '';
    else if (nGraded) s.innerHTML = `<b>${got}</b>점 · 채점 ${nGraded}문항 중 ${right}개 정답${picked > nGraded ? ` · 미채점 선택 ${Object.keys(picks).filter(n => !graded[n]).length}` : ''}`;
    else s.textContent = picked ? `${picked}문항 답 선택 · 채점 전` : '';
  }

  /* ---------- 나라별 선지 ---------- */
  const GALLERY = '__gallery';
  const REP = HQ.rep || {};
  const WHO = HQ.who || {};
  const QQ = HQ.qq || {};
  // 선지를 보고 떠올릴 답: '신라 지증왕'처럼 나라 + 왕/인물/시기(없으면 나라만)
  // 라벨이 다른 나라 이름으로 시작하면(예: 가야 멸망 → '신라 진흥왕') 그대로 쓴다
  const labelOf = it => it.who && COUNTRIES.some(c => it.who.startsWith(c + ' ')) ? it.who : it.c + (it.who ? ' ' + it.who : '');
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
      const who = (it.g && WHO[it.c + '|' + it.g]) || '';
      return { ...it, who, t: it.photo ? photoName(rep) : clean(rep), others: vs.filter(v => v !== rep && v !== clean(rep)) };
    });
  }

  function groupName(it) { return it.who || it.k || it.p || '기타'; }

  function refsHTML(it) {
    return `<div class="refs">${it.refs.map(r => `<button class="${r.ans ? 'ans' : ''}" data-r="${r.r}" data-n="${r.n}" title="${r.ans ? '정답 선지로 출제' : '오답 선지로 출제'}">${r.r}회 ${r.n}번 ${CIRCLE[r.i - 1]}${r.ans ? ' 정답' : ''}</button>`).join('')}</div>`;
  }
  function itemHTML(it) {
    const f = it.refs.length;
    return `<div class="item ch">
      <div class="row">
        <span class="freq${f >= 3 ? ' hot' : ''}" title="${f}회 출제">×${f}</span>
        <button class="ctext" aria-expanded="false"><span class="tx">${esc(it.t)}<span class="who">${esc(labelOf(it))}</span></span><span class="caret" aria-hidden="true">▶</span></button>
      </div>
      <div class="exp">${esc(it.e)}
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
      <button class="quiz-btn" id="quizbtn">퀴즈</button>
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
    mainCol.querySelector('#quizbtn').addEventListener('click', () => openQuiz(state.country === GALLERY ? null : state.country));
    const qi = mainCol.querySelector('#q');
    qi.addEventListener('input', () => { state.query = qi.value; drawList(); });

    function setCountry(c) {
      state.country = c; store.set('country', c);
      side.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.c === c));
      sel.value = c; quizOn = false; drawList(); window.scrollTo(0, 0);
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

  /* ---------- 암기 퀴즈 ---------- */
  // 선지 문장을 보고 '나라 왕/인물' 4개 중 고른다. 오답 보기는 같은 나라 다른 왕 2개 + 가까운 시대 1개처럼 헷갈리는 것으로.
  let quizOn = false;
  const QUIZ_LEN = 10;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function quizOptions(ans) {
    const answer = labelOf(ans), ci = COUNTRIES.indexOf(ans.c);
    const pool = new Map();  // 라벨 → {c, 거리}
    for (const it of index) {
      if (it.photo || it.c === '기타') continue;  // '기타'는 나라·시대가 아니라 보기로 쓰지 않는다
      const l = labelOf(it);
      if (l === answer || pool.has(l)) continue;
      pool.set(l, { c: it.c, who: it.who, d: Math.abs(COUNTRIES.indexOf(it.c) - ci) });
    }
    const all = [...pool.entries()];
    const pick = (arr, n) => shuffle(arr).slice(0, n).map(x => x[0]);
    let opts = [];
    // 보기도 왕·인물·시기 라벨끼리만: 같은 나라 다른 왕·인물 2개 + 가까운 시대 1개
    opts.push(...pick(all.filter(([, v]) => v.c === ans.c && v.who), 2));
    opts.push(...pick(all.filter(([l, v]) => v.c !== ans.c && v.who && v.d <= 2 && !opts.includes(l)), 3 - opts.length));
    if (opts.length < 3) opts.push(...pick(all.filter(([l, v]) => v.who && !opts.includes(l)), 3 - opts.length));
    return shuffle([answer, ...opts]);
  }

  // 퀴즈에 낼 문장: 정답 이름을 지운 문장이 있으면 그것, 없으면 원래 문장. 정답이 그대로 보이면 null(출제 안 함)
  function quizText(it) {
    const key = it.c + '|' + it.g;
    const t = key in QQ ? QQ[key] : it.t;
    if (!t) return null;
    const name = (it.who || '').split(' ').pop().replace(/(정부|내각)$/, '').trim();
    return name.length >= 2 && t.includes(name) ? null : t;
  }

  const QUIZ_SCOPES = ERAS.filter(([e]) => e !== '기타');

  // 퀴즈 시작 화면: 범위(전체 섞기 / 시대 묶음 여러 개 / 보던 나라)와 문제 수를 고른다
  function openQuiz(country) {
    quizOn = true;
    const cfg = store.get('quizCfg', { eras: [], n: 10 });
    let pickEras = new Set(cfg.eras.filter(e => QUIZ_SCOPES.some(([x]) => x === e)));
    let only = null, n = cfg.n || 10;
    // 왕·인물·시기 라벨이 있는 선지만 낸다(나라·시대 이름만 맞히는 문제는 너무 쉬워서 뺀다)
    const poolOf = () => index.filter(it => !it.photo && it.who && it.c !== '기타' && quizText(it) &&
      (only ? it.c === only : !pickEras.size || QUIZ_SCOPES.some(([e, cs]) => pickEras.has(e) && cs.includes(it.c))));
    const draw = () => {
      const pool = poolOf();
      app.innerHTML = `<div class="qz-page">
        <button class="qz-back" data-act="exit">← 나라별 선지</button>
        <div class="qz-setup">
          <h2>암기 퀴즈</h2>
          <p class="qz-sub">선지를 보고 어느 나라, 어느 왕·인물 때인지 골라요.</p>
          <p class="qz-label">범위</p>
          <div class="qz-chips">
            <button class="qz-chip" data-scope="all" aria-pressed="${!only && !pickEras.size}">전체 섞기</button>
            ${QUIZ_SCOPES.map(([e]) => `<button class="qz-chip" data-era="${e}" aria-pressed="${!only && pickEras.has(e)}">${e}</button>`).join('')}
            ${country ? `<button class="qz-chip" data-only="${esc(country)}" aria-pressed="${only === country}">${esc(country)}만</button>` : ''}
          </div>
          <p class="qz-hint">시대는 여러 개 골라 섞을 수 있어요.</p>
          <p class="qz-label">문제 수</p>
          <div class="seg qz-n" role="group" aria-label="문제 수">${[10, 20, 30].map(k => `<button data-n="${k}" aria-pressed="${n === k}">${k}문제</button>`).join('')}</div>
          <button class="qz-start" ${pool.length < 4 ? 'disabled' : ''}>시작하기 <span>${pool.length}개 선지 중 ${Math.min(n, pool.length)}문제</span></button>
        </div>
      </div>`;
      app.querySelector('.qz-page').onclick = e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.act === 'exit') return exitQuiz();
        if (t.dataset.scope) { pickEras = new Set(); only = null; }
        if (t.dataset.era) { only = null; pickEras.has(t.dataset.era) ? pickEras.delete(t.dataset.era) : pickEras.add(t.dataset.era); }
        if (t.dataset.only) { only = only ? null : t.dataset.only; pickEras = new Set(); }
        if (t.dataset.n) n = +t.dataset.n;
        if (t.classList.contains('qz-start')) {
          store.set('quizCfg', { eras: [...pickEras], n });
          const name = only ? only : pickEras.size ? [...pickEras].join(' · ') : '전체';
          return runQuiz(pool, n, name, () => openQuiz(country));
        }
        draw();
      };
    };
    window.scrollTo(0, 0);
    draw();
  }

  function exitQuiz() { quizOn = false; document.removeEventListener('keydown', quizKey); renderCountry(); window.scrollTo(0, 0); }
  let quizKey = () => {};

  function runQuiz(pool, n, scopeName, again) {
    const wrong = store.get('quizWrong', {});
    // 자주 나온 선지와 전에 틀린 선지가 더 자주 나오게 가중치를 준다
    const qs = pool.map(it => ({ it, w: Math.random() * (1 + Math.min(it.refs.length, 6) * 0.4 + (wrong[it.c + '|' + it.t] || 0) * 1.5) }))
      .sort((a, b) => b.w - a.w).map(x => x.it).slice(0, Math.min(n, pool.length));
    let i = 0, right = 0;
    const missed = [];

    const shell = inner => `<div class="qz-page">
      <div class="qz-head">
        <button class="qz-back" data-act="exit">← 그만하기</button>
        <span class="qz-scope">${esc(scopeName)}</span>
        <span class="qz-prog">${Math.min(i + 1, qs.length)} / ${qs.length}</span>
      </div>
      <div class="qz-bar"><i style="width:${i / qs.length * 100}%"></i></div>
      ${inner}
    </div>`;

    const draw = () => {
      if (i >= qs.length) return summary();
      const it = qs[i], answer = labelOf(it), opts = quizOptions(it);
      app.innerHTML = shell(`<div class="qz-card">
        <p class="qz-q">${esc(quizText(it))}</p>
        <div class="qz-opts">${opts.map((o, k) => `<button class="qz-opt" data-o="${esc(o)}"><span class="qz-num">${k + 1}</span><span class="qz-txt">${esc(o)}</span></button>`).join('')}</div>
        <div class="qz-fb" hidden></div>
      </div>`);
      const card = app.querySelector('.qz-card');
      app.querySelector('.qz-page').onclick = e => {
        if (e.target.closest('[data-act="exit"]')) return exitQuiz();
        const o = e.target.closest('.qz-opt');
        if (o && !card.classList.contains('answered')) {
          card.classList.add('answered');
          const ok = o.dataset.o === answer, key = it.c + '|' + it.t, w = store.get('quizWrong', {});
          if (ok) { right++; if (w[key] && !--w[key]) delete w[key]; } else { missed.push(it); w[key] = (w[key] || 0) + 1; }
          store.set('quizWrong', w);
          card.querySelectorAll('.qz-opt').forEach(b => b.classList.add(b.dataset.o === answer ? 'ok' : b === o ? 'bad' : 'dim'));
          const fb = card.querySelector('.qz-fb');
          fb.hidden = false;
          fb.innerHTML = `<p class="qz-verdict ${ok ? 'o' : 'x'}">${ok ? '정답이에요' : '아쉬워요 · 정답은 ' + esc(answer)}</p>
            <p class="qz-exp">${esc(it.e)}</p>
            <button class="qz-next">${i + 1 < qs.length ? '다음 문제' : '결과 보기'}</button>`;
          fb.querySelector('.qz-next').focus({ preventScroll: true });
        }
        if (e.target.closest('.qz-next')) { i++; draw(); window.scrollTo(0, 0); }
      };
    };

    const summary = () => {
      const pct = Math.round(right / qs.length * 100);
      app.innerHTML = shell(`<div class="qz-card qz-end">
        <p class="qz-score"><b>${right}</b><span>/ ${qs.length}</span></p>
        <p class="qz-sub">${pct >= 90 ? '거의 다 외웠어요.' : pct >= 60 ? '조금만 더 하면 돼요.' : '틀린 선지를 한 번 더 보고 다시 풀어봐요.'}</p>
        ${missed.length ? `<div class="qz-missed"><p class="qz-label">틀린 선지</p>${missed.map(it => `<div class="qz-miss"><span>${esc(quizText(it))}</span><b>${esc(labelOf(it))}</b></div>`).join('')}</div>` : ''}
        <div class="qz-actions">
          <button class="tb-btn" data-act="setup">범위 다시 고르기</button>
          <button class="qz-next" data-act="again">한 번 더</button>
        </div>
      </div>`);
      app.querySelector('.qz-bar i').style.width = '100%';
      app.querySelector('.qz-page').onclick = e => {
        if (e.target.closest('[data-act="exit"]')) return exitQuiz();
        if (e.target.closest('[data-act="setup"]')) return again();
        if (e.target.closest('[data-act="again"]')) return runQuiz(pool, n, scopeName, again);
      };
    };

    // 키보드 1~4로 고르고 Enter로 다음
    document.removeEventListener('keydown', quizKey);
    quizKey = e => {
      if (!quizOn) return document.removeEventListener('keydown', quizKey);
      const opts = app.querySelectorAll('.qz-opt');
      if (/^[1-4]$/.test(e.key) && opts[e.key - 1]) opts[e.key - 1].click();
      else if (e.key === 'Enter' && app.querySelector('.qz-card.answered .qz-next')) { e.preventDefault(); app.querySelector('.qz-next').click(); }
    };
    document.addEventListener('keydown', quizKey);
    window.scrollTo(0, 0);
    draw();
  }

  /* ---------- 탭 ---------- */
  const tabR = document.getElementById('tab-round'), tabC = document.getElementById('tab-country');
  function go(v) {
    quizOn = false;
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
