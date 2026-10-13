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
      const cls = ['ch', ok ? 'correct' : 'wrong', pick === n ? 'sel' : '', done ? 'open' : ''].join(' ');
      const verdict = done ? `<span class="verdict ${ok ? 'o' : 'x'}">${ok ? '정답' : '오답'}</span>` : '';
      return `<li class="${cls}" data-i="${n}">
        <div class="row">
          <button class="pick" aria-label="${n}번 선택">${n}</button>
          <button class="ctext" aria-expanded="${done}"><span class="tx">${c.ph
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
        // 채점하면 다섯 선지 해설을 모두 펼친다
        x.classList.add('open'); x.querySelector('.ctext').setAttribute('aria-expanded', true);
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
  const WT = HQ.wt || {};
  // 라벨 종류: k=왕·정부, t=시기, p=인물, o=단체·기구·운동. 퀴즈 보기는 같은 종류끼리 고른다
  const kindOf = it => WT[it.c + '|' + it.g] || (/(왕|정부|내각|대원군|군정|마립간|이사금)$/.test(it.who) ? 'k'
    : /^(구석기|신석기|청동기|철기|\d{4}년대.*)$/.test(it.who) ? 't' : 'p');
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
      pool.set(l, { c: it.c, who: it.who, kind: kindOf(it), d: Math.abs(COUNTRIES.indexOf(it.c) - ci) });
    }
    const all = [...pool.entries()];
    const pick = (arr, n) => shuffle(arr).slice(0, n).map(x => x[0]);
    let opts = [];
    // 같은 종류(왕·인물·시기·단체) 안에서 그럴듯한 오답을 고른다:
    // 같은 나라 +3, 이름 끝이 같음(…회, …정부, …왕) +2, 가까운 시대 +1, 약간의 무작위
    const kind = kindOf(ans), tail = s => s.slice(-1), at = tail(ans.who);
    const scored = all.filter(([, v]) => v.who && v.kind === kind)
      .map(([l, v]) => [l, (v.c === ans.c ? 3 : 0) + (tail(v.who) === at ? 2 : 0) + (v.d <= 2 ? 1 : 0) + Math.random() * 1.5])
      .sort((x, y) => y[1] - x[1]);
    opts.push(...scored.slice(0, 3).map(x => x[0]));
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

  /* ---------- 필기장 (영상 강의 등 자유 필기) ---------- */
  // 저장 형태: store 'notebook' = { id: { title, body(HTML), at(수정 시각 ms) } }
  const NB_COLORS = [['기본', ''], ['빨강', '#d6332a'], ['파랑', '#2f6fdb'], ['초록', '#1f8a4c'], ['주황', '#d97706']];
  const notebook = {
    all: () => store.get('notebook', {}),
    save(id, v) { const a = notebook.all(); a[id] = { ...a[id], ...v, at: Date.now() }; store.set('notebook', a); HQCloud.noteChanged?.(id); },
    remove(id) { const a = notebook.all(); delete a[id]; store.set('notebook', a); HQCloud.noteChanged?.(id); },
  };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // 붙여넣기·불러온 내용에서 허용한 서식(굵게·색·줄바꿈·목록)만 남긴다
  /* ---------- 정리노트 타자 연습: 회색 글씨를 제목부터 한 줄씩 따라 친다 ---------- */
  // 한글·숫자·키보드 기호는 그대로 친다. 한자·영어·※ 같은 글자 묶음은 스페이스 한 번으로 채운다
  const TYPABLE = /[가-힣ㄱ-ㆎ0-9 !-\/:-@\[-`{-~→←↔]/;
  const KEYS = { '→': '->', '←': '<-', '↔': '<->' };
  function typeLines(title, html) {
    const box = document.createElement('div'); box.innerHTML = cleanHTML(html);
    const rows = [[...title].map(c => ({ c }))];
    for (const row of box.children) {
      const chars = [];
      const walk = (n, st) => {
        if (n.nodeType === 3) { for (const c of n.nodeValue.replace(/\s+/g, ' ')) chars.push({ c, ...st }); return; }
        if (n.nodeType !== 1) return;
        const s = { ...st };
        if (/^(B|STRONG)$/.test(n.tagName)) s.b = 1;
        if (n.style?.color) s.color = n.style.color;
        n.childNodes.forEach(k => walk(k, s));
      };
      walk(row, {});
      while (chars[0]?.c === ' ') chars.shift();
      while (chars.at(-1)?.c === ' ') chars.pop();
      if (chars.length) rows.push(chars);
    }
    return rows.map((chars, ri) => {
      const toks = [], ok = c => TYPABLE.test(c);
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i].c;
        // 어떤 글자든 스페이스를 누르면 그 글자로 채운다(띄어쓰기 자리는 그냥 띄어쓰기)
        if (ok(c)) { toks.push({ idx: [i], keys: c, alt: c === ' ' ? null : KEYS[c] ? [KEYS[c], ' '] : [' '] }); continue; }
        // 칠 수 없는 글자 묶음(사이 띄어쓰기 포함)과 앞뒤 띄어쓰기 한 칸을 스페이스 한 번으로
        let j = i;
        while (j + 1 < chars.length && (!ok(chars[j + 1].c) || (chars[j + 1].c === ' ' && chars[j + 2] && !ok(chars[j + 2].c)))) j++;
        const idx = []; for (let k = i; k <= j; k++) idx.push(k);
        if (toks.at(-1)?.keys === ' ' && !toks.at(-1).auto) idx.unshift(...toks.pop().idx);
        if (chars[j + 1]?.c === ' ') idx.push(++j);
        toks.push({ idx, keys: idx.map(k => chars[k].c).join(''), alt: [' '], auto: true });
        i = j;
      }
      // 줄 맨 앞 · 는 미리 찍어 둔다(치지 않음)
      const pre = toks[0]?.auto && chars[toks[0].idx[0]].c === '·' ? toks.shift().idx : [];
      // [흐름] 같은 소제목 줄은 미리 채워 두고 건너뛴다
      const fixed = ri > 0 && /^\[[^\]]*\]$/.test(chars.map(c => c.c).join(''));
      return { chars, toks, pre, fixed, len: toks.reduce((n, t) => n + t.keys.length, 0) };
    });
  }
  // 친 글자열을 토큰과 맞춰 본다: ok / bad / cmp(조합 중·덜 침) / todo
  function typeMarks(L, t, composing) {
    let p = 0, ok = 0, bad = 0;
    const marks = L.toks.map((tk, n) => {
      if (p >= t.length) return 'todo';
      // ->를 치는 중('-'까지만 침)이면 아직 틀린 게 아니다
      if (tk.alt && tk.alt.some(x => x.length > t.length - p && x.startsWith(t.slice(p)))) { p = t.length; return 'cmp'; }
      const seg = t.slice(p, p + tk.keys.length); p += tk.keys.length;
      if (seg.length < tk.keys.length || (composing && p >= t.length)) return 'cmp';
      if (seg === tk.keys) { ok++; return 'ok'; }
      bad++; return 'bad';
    });
    return { marks, ok, bad };
  }
  function setupTyping(root, head, paper, key, title, html, onEnd, focusNow) {
    const L = typeLines(title, html);
    // 노트 내용이 바뀌면 쳐 둔 기록은 버린다
    const sig = [...L.map(l => l.chars.map(c => c.c).join('')).join('\n')].reduce((h, c) => (h * 31 + c.codePointAt(0)) | 0, 7);
    let saved = store.get('type4:' + key, null);
    if (saved?.sig !== sig) saved = null;
    const full = l => l.toks.map(t => t.keys).join('');
    const typed = L.map((l, i) => l.fixed ? full(l) : saved?.typed?.[i] || '');
    // 소제목 줄을 건너뛰어 d 방향으로 가장 가까운 칠 줄
    const step = (i, d) => { while (L[i]?.fixed) i += d; return L[i] ? i : null; };
    let at = step(Math.min(saved?.at ?? 0, L.length - 1), 1) ?? 0, composing = false, enterAfter = false;
    // 지금 줄 바로 아래에 실제 입력 칸을 둔다(친 글자가 그대로 보이게)
    const inp = document.createElement('input');
    inp.className = 'tp-input'; inp.setAttribute('aria-label', '정리노트 따라 치기');
    inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('autocorrect', 'off');
    const bar = root.querySelector('.tp-bar'), body = paper.querySelector('.nb-type');
    const els = [head, ...L.slice(1).map(() => { const d = document.createElement('div'); d.className = 'tp-line'; body.append(d); return d; })];
    els.forEach((el, i) => { el.dataset.line = i; });
    const charHTML = (ch, cls) => `<span class="${cls}"${ch.b || ch.color ? ` style="${ch.b ? 'font-weight:700;' : ''}${ch.color ? 'color:' + ch.color : ''}"` : ''}>${esc(ch.c)}</span>`;
    const draw = i => {
      const l = L[i], cur = i === at, t = typed[i];
      const { marks } = typeMarks(l, t, cur && composing);
      const cls = new Array(l.chars.length).fill('tp-todo');
      l.pre.forEach(k => { cls[k] = 'tp-ok'; });
      let caret = -1;
      l.toks.forEach((tk, n) => { tk.idx.forEach(k => { cls[k] = 'tp-' + marks[n]; }); if (caret < 0 && marks[n] === 'todo') caret = tk.idx[0]; });
      if (cur && caret >= 0) cls[caret] += ' tp-at';
      els[i].innerHTML = l.chars.map((ch, k) => charHTML(ch, cls[k])).join('');
      els[i].classList.toggle('tp-cur', cur);
    };
    const stats = () => {
      let ok = 0, all = 0, lines = 0;
      const real = L.filter(l => !l.fixed);
      L.forEach((l, i) => { if (l.fixed) return; const r = typeMarks(l, typed[i], false); ok += r.ok; all += r.ok + r.bad; if (typed[i].length >= l.len) lines++; });
      bar.querySelector('.tp-stat').textContent = `${lines} / ${real.length}줄${all ? ` · 정확도 ${Math.round(ok / all * 100)}%` : ''}${lines === real.length ? ' · 완료!' : ''}`;
    };
    let st;
    const persist = () => { clearTimeout(st); st = setTimeout(() => store.set('type4:' + key, { sig, at, typed }), 300); };
    const mount = () => {
      inp.classList.toggle('tp-input-head', at === 0);
      (at === 0 ? head.closest('.nb-headrow') : els[at]).after(inp);
    };
    const goLine = i => {
      const prev = at; at = Math.max(0, Math.min(L.length - 1, i));
      composing = false; show();
      draw(prev); draw(at); mount(); stats(); persist();
      inp.focus({ preventScroll: true });
      const r = inp.getBoundingClientRect();
      if (r.bottom > innerHeight - 40 || r.top < 80) inp.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    L.forEach((_, i) => draw(i)); stats(); mount();
    // 입력 칸에도 줄 앞 · 를 미리 넣어 둔다. typed에는 그 뒤에 친 것만 담는다
    const pfx = () => L[at].pre.map(k => L[at].chars[k].c).join('');
    const show = () => { inp.value = pfx() + typed[at]; inp.setSelectionRange(inp.value.length, inp.value.length); };
    const typedPart = () => { const p = pfx(), v = inp.value; return v.startsWith(p) ? v.slice(p.length) : v.replace(/^·\s?/, ''); };
    // 스페이스(또는 ->)를 친 자리면 그 자리의 제 글자로 바꿔 넣는다
    const fill = t => {
      let p = 0;
      for (const tk of L[at].toks) {
        if (p >= t.length) break;
        if (tk.alt && !t.startsWith(tk.keys, p)) { const a = tk.alt.find(a => t.startsWith(a, p)); if (a) t = t.slice(0, p) + tk.keys + t.slice(p + a.length); }
        p += tk.keys.length;
      }
      return t;
    };
    const next = end => {
      if (typed[at].length < L[at].len) return;
      const n = step(at + 1, 1);
      if (n != null) goLine(n); else if (end && onEnd) onEnd();
    };
    const sync = () => {
      let t = typedPart();
      if (!composing) {
        // 다 친 줄 끝에서 스페이스 → 다음 줄
        const len = L[at].len;
        if (t.length > len && t.endsWith(' ') && step(at + 1, 1) != null) { typed[at] = t.slice(0, len); return next(); }
        t = fill(t);
      }
      const changed = pfx() + t !== inp.value;
      typed[at] = t;
      if (changed && !composing) show();
      draw(at); stats(); persist();
    };
    show();
    inp.addEventListener('input', e => { composing = !!e.isComposing; sync(); });
    inp.addEventListener('compositionend', () => {
      composing = false; sync();
      if (enterAfter) { enterAfter = false; setTimeout(() => next(true), 0); }
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.isComposing || e.keyCode === 229) { enterAfter = true; return; }
        next(true);
      } else if (e.key === 'Backspace' && !e.isComposing && inp.selectionStart <= pfx().length && inp.selectionEnd <= pfx().length) {
        // 미리 찍힌 · 는 지우지 않고, 빈 줄이면 앞 줄로
        e.preventDefault();
        if (!typed[at] && step(at - 1, -1) != null) goLine(step(at - 1, -1));
      }
    });
    inp.addEventListener('focus', () => root.classList.add('tp-on'));
    inp.addEventListener('blur', () => root.classList.remove('tp-on'));
    // 아무 줄이나 누르면 그 줄부터 친다
    root.addEventListener('click', e => {
      if (e.target === inp) return;
      const ln = e.target.closest('[data-line]');
      const to = ln && (step(+ln.dataset.line, 1) ?? step(+ln.dataset.line, -1));
      if (ln && to !== at) return goLine(to);
      if (ln || e.target.closest('.nb-sum')) inp.focus({ preventScroll: true });
    });
    if (focusNow) inp.focus({ preventScroll: true });
    bar.querySelector('.tp-reset').addEventListener('click', () => {
      L.forEach((l, i) => { typed[i] = l.fixed ? full(l) : ''; }); at = 0; show();
      L.forEach((_, i) => draw(i)); stats(); mount(); persist(); inp.focus({ preventScroll: true });
    });
  }

  function cleanHTML(html) {
    const doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
    const walk = node => {
      for (const ch of [...node.childNodes]) {
        if (ch.nodeType === 3) continue;
        if (ch.nodeType !== 1) { ch.remove(); continue; }
        walk(ch);
        const tag = ch.tagName.toLowerCase();
        if (['b', 'strong', 'br', 'div', 'p', 'ul', 'ol', 'li'].includes(tag)) { [...ch.attributes].forEach(a => ch.removeAttribute(a.name)); continue; }
        if (tag === 'span' || tag === 'font') {
          const color = ch.style?.color || ch.getAttribute('color') || '';
          const bold = /bold|[6-9]00/.test(ch.style?.fontWeight || '');
          const span = doc.createElement(bold ? 'b' : 'span');
          if (color) span.style.color = color;
          span.append(...ch.childNodes); ch.replaceWith(span); continue;
        }
        ch.replaceWith(...ch.childNodes);
      }
    };
    const root = doc.body.firstChild; walk(root);
    return root.innerHTML;
  }

  // 시대별 연표: 탭마다 나라별 라인을 나란히 두고, 왕을 재위 연도 위치에 놓아 같은 시기를 한눈에 비교한다
  // [이름, 시작 연도, 끝 연도] — 기원전은 음수
  const KINGS = {
    고구려: [['동명왕', -37, -19], ['태조왕', 53, 146], ['고국천왕', 179, 197], ['동천왕', 227, 248], ['미천왕', 300, 331], ['고국원왕', 331, 371], ['소수림왕', 371, 384], ['광개토대왕', 391, 413], ['장수왕', 413, 491], ['문자왕', 491, 519], ['영양왕', 590, 618], ['영류왕', 618, 642], ['보장왕', 642, 668]],
    백제: [['온조왕', -18, 28], ['고이왕', 234, 286], ['근초고왕', 346, 375], ['침류왕', 384, 385], ['비유왕', 427, 455], ['개로왕', 455, 475], ['문주왕', 475, 477], ['동성왕', 479, 501], ['무령왕', 501, 523], ['성왕', 523, 554], ['무왕', 600, 641], ['의자왕', 641, 660]],
    // 가야 왕의 재위 연도는 전승·추정이 섞여 있어 대표 왕만 둔다
    가야: [['김수로왕', 42, 199], ['구형왕', 521, 532], ['도설지왕', 554, 562]],
    신라: [['내물왕', 356, 402], ['눌지왕', 417, 458], ['소지왕', 479, 500], ['지증왕', 500, 514], ['법흥왕', 514, 540], ['진흥왕', 540, 576], ['진평왕', 579, 632], ['선덕여왕', 632, 647], ['진덕여왕', 647, 654]],
    통일신라: [['태종무열왕', 654, 661], ['문무왕', 661, 681], ['신문왕', 681, 692], ['성덕왕', 702, 737], ['경덕왕', 742, 765], ['혜공왕', 765, 780], ['원성왕', 785, 798], ['헌덕왕', 809, 826], ['흥덕왕', 826, 836], ['진성여왕', 887, 897], ['경순왕', 927, 935]],
    발해: [['고왕', 698, 719], ['무왕', 719, 737], ['문왕', 737, 793], ['선왕', 818, 830], ['대인선', 906, 926]],
    후삼국: [['견훤', 900, 936], ['궁예', 901, 918]],
    고려: [['태조', 918, 943], ['광종', 949, 975], ['경종', 975, 981], ['성종', 981, 997], ['목종', 997, 1009], ['현종', 1009, 1031], ['문종', 1046, 1083], ['숙종', 1095, 1105], ['예종', 1105, 1122], ['인종', 1122, 1146], ['의종', 1146, 1170], ['명종', 1170, 1197], ['신종', 1197, 1204], ['고종', 1213, 1259], ['원종', 1259, 1274], ['충렬왕', 1274, 1308], ['충선왕', 1308, 1313], ['공민왕', 1351, 1374], ['우왕', 1374, 1388], ['창왕', 1388, 1389], ['공양왕', 1389, 1392]],
    조선: [['태조', 1392, 1398], ['정종', 1398, 1400], ['태종', 1400, 1418], ['세종', 1418, 1450], ['문종', 1450, 1452], ['단종', 1452, 1455], ['세조', 1455, 1468], ['성종', 1469, 1494], ['연산군', 1494, 1506], ['중종', 1506, 1544], ['명종', 1545, 1567], ['선조', 1567, 1608], ['광해군', 1608, 1623], ['인조', 1623, 1649], ['효종', 1649, 1659], ['현종', 1659, 1674], ['숙종', 1674, 1720], ['경종', 1720, 1724], ['영조', 1724, 1776], ['정조', 1776, 1800], ['순조', 1800, 1834], ['헌종', 1834, 1849], ['철종', 1849, 1863]],
    개항기: [['흥선대원군', 1863, 1873], ['고종', 1873, 1907], ['순종', 1907, 1910]],
    일제강점기: [['1910년대', 1910, 1919], ['1920년대', 1919, 1931], ['1930년대 이후', 1931, 1945]],
    현대: [['미군정', 1945, 1948], ['이승만 정부', 1948, 1960], ['허정 과도 정부', 1960, 1960.4], ['장면 내각', 1960.4, 1961], ['박정희 정부', 1961, 1979], ['최규하 정부', 1979, 1980], ['전두환 정부', 1980, 1988], ['노태우 정부', 1988, 1993], ['김영삼 정부', 1993, 1998], ['김대중 정부', 1998, 2003], ['노무현 정부', 2003, 2008], ['이명박 정부', 2008, 2013], ['박근혜 정부', 2013, 2017], ['문재인 정부', 2017, 2022], ['윤석열 정부', 2022, 2025]],
  };
  // 시대 탭: 그 기간에 걸친 나라를 모두 라인으로 둔다(라인에는 기간 안의 왕만)
  const ERAS_TL = [
    { name: '고대 초기', simple: [['선사', ['구석기', '신석기', '청동기', '철기']], ['고조선', ['단군왕검', '위만', '우거왕']], ['부여', []], ['옥저', []], ['동예', []], ['삼한', []]] },
    { name: '삼국', from: -50, to: 700, tick: 50, countries: ['고구려', '백제', '가야', '신라'] },
    { name: '남북국', from: 650, to: 940, tick: 20, countries: ['통일신라', '발해', '후삼국'] },
    { name: '고려', from: 890, to: 1400, tick: 50, countries: ['후삼국', '고려'] },
    { name: '조선', from: 1390, to: 1870, tick: 50, countries: ['조선'] },
    { name: '근현대', from: 1860, to: 2025, tick: 10, countries: ['개항기', '일제강점기', '현대'] },
  ].map(e => e.countries ? { ...e, lanes: e.countries.map(c => [c, KINGS[c].filter(([, a, b]) => b >= e.from && a <= e.to)]) } : e);
  const ALL = '전체';
  const noteId = (c, k) => c + '|' + (k || ALL);
  const yearLabel = y => y < 0 ? '기원전 ' + -y : y + '';
  // 필기가 있는 나라|왕 → 그 왕이 들어 있는 시대 탭
  const SUM = HQ.sum || {};
  const eraOf = id => {
    const [c, k] = id.split('|');
    if (c === '시대') return k;
    return ERAS_TL.find(e => (e.lanes || e.simple).some(([lc, ks]) => lc === c && (k === ALL || ks.some(x => (Array.isArray(x) ? x[0] : x) === k))))?.name || '삼국';
  };

  // 정리노트 넘김 순서: 시대마다 [시대 전체 → 나라 전체 → 왕들]
  const NOTE_ORDER = ERAS_TL.flatMap(e => [[noteId('시대', e.name), e.name],
    ...(e.lanes || e.simple).flatMap(([c, ks]) => [[noteId(c, ''), e.name], ...ks.map(k => [noteId(c, Array.isArray(k) ? k[0] : k), e.name])])]);
  const nextNote = (id, eraName) => {
    const i = NOTE_ORDER.findIndex(([n, e]) => n === id && e === eraName);
    return NOTE_ORDER.slice(i + 1).find(([n]) => SUM[n]);
  };
  let typeFocus = false;

  function renderNotes(keepTl) {
    if (!index) buildIndex();
    const items = notebook.all();
    let cur = store.get('notebookCur', '');
    if (!/\|/.test(cur || '')) cur = noteId('신라', '지증왕');
    const [cc, kk] = cur.split('|');
    const era = ERAS_TL.find(e => e.name === store.get('notebookEra', eraOf(cur))) || ERAS_TL[1];
    // 내 필기 / 정리노트(읽기 전용 요약)
    const mode = store.get('notebookMode', 'mine');
    const isEra = cc === '시대';
    const title = isEra ? kk + ' 시대 전체' : kk === ALL ? cc + ' 전체' : kk;
    const hasNote = id => !!(items[id] && (items[id].body || '').replace(/<[^>]+>/g, '').trim());
    const related = isEra ? [] : index.filter(it => !it.photo && it.c === cc && (kk === ALL ? !it.who : it.who === kk))
      .sort((a, b) => b.refs.length - a.refs.length);
    const cls = id => `${hasNote(id) ? ' has' : ''}`;

    let chart;
    if (era.simple) {
      chart = `<div class="tl-simple">${era.simple.map(([c, ks]) => `<div class="tl-sg"><p>${c}</p><div>${[ALL, ...ks].map(k => {
        const id = noteId(c, k === ALL ? '' : k);
        return `<button class="tl-k${cls(id)}" data-id="${esc(id)}" aria-current="${id === cur}">${esc(k)}</button>`; }).join('')}</div></div>`).join('')}</div>`;
    } else {
      // 연도 → 세로 위치. 짧은 재위도 이름이 보이게 최소 높이를 두고, 같은 라인에서 겹치면 아래로 민다
      const PX = Math.max(1.1, 1500 / (era.to - era.from)), MIN = 32, top = y => (y - era.from) * PX;
      const H = top(era.to) + 20;
      const ticks = [];
      for (let y = Math.ceil(era.from / era.tick) * era.tick; y <= era.to; y += era.tick) ticks.push(y);
      const lanes = era.lanes.map(([c, ks]) => {
        let floor = -Infinity;
        const blocks = ks.map(([k, a, b]) => {
          const y = Math.max(top(a), floor), h = Math.max(top(b) - top(a), MIN);
          floor = y + h + 2;
          const id = noteId(c, k);
          return `<button class="tl-b${cls(id)}" data-id="${esc(id)}" aria-current="${id === cur}" style="top:${y}px;height:${h}px" title="${esc(k)} ${yearLabel(a)}–${yearLabel(Math.floor(b))}"><b>${esc(k)}</b><small>${yearLabel(a)}</small></button>`;
        }).join('');
        const allId = noteId(c, '');
        const grid = ticks.map(y => `<i class="tl-grid" style="top:${top(y)}px"></i>`).join('');
        return `<div class="tl-lane"><button class="tl-lh${cls(allId)}" data-id="${esc(allId)}" aria-current="${allId === cur}">${c}<small>전체</small></button><div class="tl-track" style="height:${H}px">${grid}${blocks}</div></div>`;
      }).join('');
      chart = `<div class="tl-chart" style="--lanes:${era.lanes.length}">
        <div class="tl-axis"><div class="tl-lh tl-lh-axis">연도</div><div class="tl-track" style="height:${H}px">${ticks.map(y => `<span style="top:${top(y)}px">${yearLabel(y)}</span>`).join('')}</div></div>
        ${lanes}
      </div>`;
    }

    app.innerHTML = `<div class="nb">
      <div class="tl">
        <div class="nb-mode" role="group" aria-label="보기">
          <button data-mode="mine" aria-pressed="${mode === 'mine'}">내 필기</button>
          <button data-mode="sum" aria-pressed="${mode === 'sum'}">정리노트</button>
        </div>
        <div class="seg tl-eras" role="group" aria-label="시대">${ERAS_TL.map(e => `<button data-era="${e.name}" aria-pressed="${e === era}">${e.name}</button>`).join('')}</div>
        <button class="tl-eraall${cls(noteId('시대', era.name))}" data-id="${esc(noteId('시대', era.name))}" aria-current="${cur === noteId('시대', era.name)}">${era.name} 시대 전체</button>
        <div class="tl-scroll">${chart}</div>
      </div>
      <section class="nb-main" id="nb-main">
        <p class="nb-where">${esc(isEra ? '시대' : cc)}${mode === 'sum' ? ' · 정리노트' : ''}</p>
        <div class="nb-headrow">
          <h2 class="nb-head">${esc(title)}</h2>
          ${related.length ? `<div class="nb-relwrap">
            <button class="nb-relbtn" aria-expanded="false" aria-controls="nb-relpop">기출 선지 <b>${related.length}</b><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3"/></svg></button>
            <div class="nb-relpop" id="nb-relpop" hidden><ul>${related.map(it => `<li><span>${esc(it.t)}</span><small>${it.refs.length}회</small></li>`).join('')}</ul></div>
          </div>` : ''}
        </div>
        <div class="nb-tools" role="toolbar" aria-label="서식"${mode === 'sum' ? ' hidden' : ''}>
          <button class="nb-b" data-cmd="bold" title="굵게 (Ctrl+B)"><b>B</b></button>
          <span class="nb-sep"></span>
          ${NB_COLORS.map(([n, c]) => `<button class="nb-color" data-color="${c}" title="${n}" aria-label="글자색 ${n}"><i style="${c ? 'background:' + c : ''}"></i></button>`).join('')}
          <span class="nb-saved" id="nb-saved"></span>
        </div>
        ${mode === 'sum' && SUM[cur] ? `<div class="tp-bar"><span class="tp-stat"></span><span class="tp-hint">모르면 스페이스로 채우기 · 줄 끝에서 스페이스로 다음 줄 · 마지막 줄에서 Enter로 다음 노트</span><button class="tp-reset">처음부터</button></div>` : ''}
        ${mode === 'sum' ? `<div class="nb-paper nb-sum"><div class="nb-editor nb-read${SUM[cur] ? ' nb-type' : ''}" id="nb-editor">${SUM[cur] ? '' : '<div class="nb-none">이 칸의 정리노트는 아직 없어요.</div>'}</div></div>` : ''}
        <div class="nb-paper"${mode === 'sum' ? ' hidden' : ''}><div class="nb-editor" id="nb-editor-mine" contenteditable="true" spellcheck="false" data-ph="강의를 들으며 ${esc(isEra ? kk + ' 시대' : kk === ALL ? cc : kk)}에 대해 필기하세요. 글자를 선택하고 색을 고르거나 Ctrl+B로 굵게 할 수 있어요.">${cleanHTML(items[cur]?.body || '')}</div></div>
      </section>
    </div>`;

    const ed = app.querySelector('#nb-editor-mine'), saved = app.querySelector('#nb-saved');
    const shown = mode === 'sum' ? app.querySelector('#nb-editor') : ed;
    // 메모지가 화면 아래 끝까지 오도록 최소 높이를 맞춘다(내용이 더 길면 그만큼 늘어남)
    const fit = () => { if (!shown.isConnected) return removeEventListener('resize', fit); shown.style.minHeight = Math.max(320, innerHeight - (shown.getBoundingClientRect().top + scrollY) - 24) + 'px'; };
    fit(); addEventListener('resize', fit);
    if (mode === 'sum' && SUM[cur]) {
      // 마지막 줄에서 Enter → 다음 정리노트로 넘어가 바로 이어 친다
      const goNext = () => {
        const nx = nextNote(cur, era.name); if (!nx) return;
        store.set('notebookCur', nx[0]); store.set('notebookEra', nx[1]);
        typeFocus = true; renderNotes(); scrollTo(0, 0);
      };
      setupTyping(app.querySelector('#nb-main'), app.querySelector('.nb-head'), app.querySelector('.nb-sum'), cur, title, SUM[cur], goNext, typeFocus);
      typeFocus = false;
    }
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    let t;
    const persist = () => {
      clearTimeout(t); saved.textContent = '';
      t = setTimeout(() => {
        notebook.save(cur, { title: kk, body: ed.innerHTML });
        saved.textContent = '저장됨';
        const has = !!ed.textContent.trim();
        app.querySelectorAll(`[data-id="${CSS.escape(cur)}"]`).forEach(b => b.classList.toggle('has', has));
      }, 400);
    };
    ed.addEventListener('input', persist);
    ed.addEventListener('paste', e => {
      e.preventDefault();
      const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
      document.execCommand('insertHTML', false, html ? cleanHTML(html) : esc(text).replace(/\n/g, '<br>'));
    });
    ed.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); persist(); }
    });
    // 툴바: 누를 때 편집 영역의 선택이 풀리지 않도록 mousedown 기본 동작을 막는다
    const tools = app.querySelector('.nb-tools');
    tools.addEventListener('mousedown', e => { if (e.target.closest('[data-cmd],[data-color]')) e.preventDefault(); });
    tools.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.cmd === 'bold') { ed.focus(); document.execCommand('bold'); persist(); }
      if (b.dataset.color !== undefined) {
        ed.focus();
        if (b.dataset.color) document.execCommand('foreColor', false, b.dataset.color);
        else {
          // '기본'은 색 지정을 지워 테마 글자색을 따르게 한다
          document.execCommand('foreColor', false, '#010101');
          ed.querySelectorAll('[style]').forEach(n => { if (/rgb\(1, 1, 1\)|#010101/i.test(n.style.color)) n.style.removeProperty('color'); if (!n.getAttribute('style')) n.removeAttribute('style'); });
          ed.querySelectorAll('font[color="#010101"]').forEach(n => n.replaceWith(...n.childNodes));
        }
        persist();
      }
    });
    // 기출 선지: 제목 오른쪽 버튼으로 여닫는 목록
    const rb = app.querySelector('.nb-relbtn'), rp = app.querySelector('#nb-relpop');
    if (rb) {
      const setOpen = o => { rp.hidden = !o; rb.setAttribute('aria-expanded', o); };
      rb.addEventListener('click', e => { e.stopPropagation(); setOpen(rp.hidden); });
      const away = e => { if (!rp.isConnected) return document.removeEventListener('click', away); if (!e.target.closest('.nb-relwrap')) setOpen(false); };
      document.addEventListener('click', away);
      rp.addEventListener('keydown', e => { if (e.key === 'Escape') { setOpen(false); rb.focus(); } });
    }
    const tl = app.querySelector('.tl');
    tl.addEventListener('click', e => {
      const md = e.target.closest('[data-mode]');
      if (md) { store.set('notebookMode', md.dataset.mode); return renderNotes(app.querySelector('.tl-scroll').scrollTop); }
      const er = e.target.closest('[data-era]');
      if (er) { store.set('notebookEra', er.dataset.era); return renderNotes(); }
      const b = e.target.closest('[data-id]'); if (!b) return;
      store.set('notebookCur', b.dataset.id); store.set('notebookEra', era.name);
      const y = scrollY, sc = app.querySelector('.tl-scroll').scrollTop;
      renderNotes(sc);
      // 모바일은 연표 아래 편집 칸으로 내려 준다
      if (!WIDE.matches) document.getElementById('nb-main').scrollIntoView({ behavior: 'smooth' }); else scrollTo(0, y);
    });
    // 고른 왕이 연표 안에서 보이도록 연표 상자만 스크롤한다(페이지는 움직이지 않음)
    const curEl = app.querySelector('.tl-b[aria-current="true"]'), box = app.querySelector('.tl-scroll');
    if (curEl && box && keepTl == null) box.scrollTop = Math.max(0, curEl.offsetTop + curEl.offsetParent.offsetTop - box.clientHeight / 2);
    if (keepTl != null) box.scrollTop = keepTl;
  }

  /* ---------- 탭 ---------- */
  const tabR = document.getElementById('tab-round'), tabC = document.getElementById('tab-country'), tabN = document.getElementById('tab-notes');
  const VIEWS = ['round', 'country', 'notes'];
  function go(v) {
    quizOn = false;
    state.view = v; store.set('view', v);
    tabR.setAttribute('aria-selected', v === 'round'); tabC.setAttribute('aria-selected', v === 'country'); tabN.setAttribute('aria-selected', v === 'notes');
    v === 'round' ? renderRound() : v === 'notes' ? renderNotes() : renderCountry();
    // 로그인 직후 주소에 붙어 오는 정보(#access_token 등)는 건드리지 않는다
    if (location.hash !== '#' + v && !/access_token|error_description/.test(location.hash)) history.replaceState(null, '', '#' + v);
  }
  tabR.onclick = () => { go('round'); window.scrollTo(0, 0); };
  tabC.onclick = () => { go('country'); window.scrollTo(0, 0); };
  tabN.onclick = () => { go('notes'); window.scrollTo(0, 0); };
  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if (VIEWS.includes(v) && v !== state.view) go(v);
  });
  const h = location.hash.slice(1);
  go(VIEWS.includes(h) ? h : VIEWS.includes(state.view) ? state.view : 'round');
  // 로그인 후 서버 기록을 받아오면 지금 화면을 다시 그린다
  HQCloud.init({ onPulled: () => { const y = scrollY; go(state.view); scrollTo(0, y); } });
})();
