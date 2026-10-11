"""회차별 해설 JSON + 정답표 + 개념 묶음을 합쳐 data/exam-NN.js, data/concepts.js 를 만든다.

사용: python3 build/build_data.py            (기본 경로 build/src/... 사용)
입력:
  build/src/explain/NN.json   회차별 문항·선지·해설
  build/src/answers.json      정답표 {"회차": {"문항": {"a": [정답], "p": 배점}}}
  build/src/concepts/*.json   {keys: {"회차-문항-선지": 개념 키}, rep: {"나라|키": 대표 문장}}
  build/src/audit/*.false.json  {x: [나라별 정리에서 뺄 선지], move: {선지: {c, g}}}
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COUNTRIES = ['선사', '고조선', '부여', '고구려', '옥저', '동예', '삼한', '백제', '가야', '신라', '통일신라',
             '발해', '후삼국', '고려', '조선', '개항기', '일제강점기', '현대', '기타']
ALIAS = {'대한제국': '개항기', '근대': '개항기', '개화기': '개항기', '일제': '일제강점기', '남북국': '통일신라',
         '구석기': '선사', '신석기': '선사', '청동기': '선사', '철기': '선사', '선사시대': '선사', '후백제': '후삼국',
         '태봉': '후삼국', '후고구려': '후삼국', '삼국': '기타', '대한민국': '현대', '조선(개항기)': '개항기',
         '마한': '삼한', '진한': '삼한', '변한': '삼한', '금관가야': '가야', '대가야': '가야'}
KING_FIX = {'광개토대왕': '광개토대왕', '광개토왕': '광개토대왕', '흥선대원군': '고종'}


def fix_country(c):
    c = (c or '').strip()
    if c in COUNTRIES:
        return c
    if c in ALIAS:
        return ALIAS[c]
    for k, v in ALIAS.items():
        if k in c:
            return v
    for k in COUNTRIES:
        if k in c:
            return k
    return '기타'


def fix_king(k):
    k = re.sub(r'\s+', '', k or '')
    return KING_FIX.get(k, k)


def load_concepts(path):
    """ck_out 폴더의 {keys, rep} 파일들을 합친다."""
    keys, rep = {}, {}
    if path and os.path.isdir(path):
        for fn in sorted(os.listdir(path)):
            if fn.endswith('.json'):
                d = json.load(open(os.path.join(path, fn)))
                keys.update(d.get('keys', {}))
                rep.update(d.get('rep', {}))
    return keys, rep


def load_false(concepts_dir):
    """audit/*.false.json: x(나라별 정리에서 뺄 거짓 서술), move(다른 나라·개념으로 옮길 선지)."""
    x, move = set(), {}
    audit = os.path.join(os.path.dirname(concepts_dir or ''), 'audit')
    for fn in sorted(os.listdir(audit)) if os.path.isdir(audit) else []:
        if fn.endswith('.false.json'):
            d = json.load(open(os.path.join(audit, fn)))
            x.update(d.get('x', []))
            move.update(d.get('move', {}))
    return x, move


SRC = os.path.join(ROOT, 'build', 'src')


def main(src=os.path.join(SRC, 'explain'), answers_path=os.path.join(SRC, 'answers.json'), concepts_dir=os.path.join(SRC, 'concepts')):
    keys, rep = load_concepts(concepts_dir)
    xs, moves = load_false(concepts_dir)
    with open(os.path.join(ROOT, 'data', 'concepts.js'), 'w') as f:
        f.write('HQ.rep=' + json.dumps(rep, ensure_ascii=False, separators=(',', ':')) + ';\n')
    answers = json.load(open(answers_path))
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    report = []
    for fn in sorted(os.listdir(src)):
        if not re.fullmatch(r'\d+\.json', fn):
            continue
        r = fn[:-5]
        ex = json.load(open(os.path.join(src, fn)))
        ans = answers[r]
        qs = []
        for q in sorted(ex['questions'], key=lambda q: q['n']):
            n = q['n']
            a = ans[str(n)]
            img = f'img/{r}/{n:02d}.jpg'
            out = {
                'n': n, 'pt': a['p'], 'a': a['a'], 'q': q.get('q', ''),
                'material': q.get('material', ''), 'clue': q.get('clue', ''),
                'target': q.get('target'),
                'img': img if os.path.exists(os.path.join(ROOT, img)) else None,
                'choices': [{'t': c.get('t', ''), 'c': fix_country(c.get('c')), 'k': fix_king(c.get('k')),
                             'p': (c.get('p') or '').strip(), 'e': c.get('e', ''),
                             **({'g': keys[f'{r}-{n}-{i + 1}']} if f'{r}-{n}-{i + 1}' in keys else {}),
                             **({'ph': f'img/{r}/{n:02d}-{i + 1}.jpg'}
                                if os.path.exists(os.path.join(ROOT, f'img/{r}/{n:02d}-{i + 1}.jpg')) else {})}
                            for i, c in enumerate(q.get('choices', []))],
            }
            for i, c in enumerate(out['choices']):
                cid = f'{r}-{n}-{i + 1}'
                if cid in xs:
                    c['x'] = 1  # 거짓 서술: 회차별 풀이에만 보이고 나라별 정리에서는 뺀다
                if cid in moves:
                    c['c'] = fix_country(moves[cid].get('c', c['c']))
                    if moves[cid].get('g'):
                        c['g'] = moves[cid]['g']
            if out['target']:
                out['target'] = {**out['target'], 'c': fix_country(out['target'].get('c'))}
            if a.get('note'):
                out['note'] = a['note']
            if q.get('src'):
                out['src'] = q['src']
            if q.get('missing'):
                out['missing'] = True
            if len(out['choices']) != 5 and not out.get('missing'):
                report.append(f'{r}-{n}: 선지 {len(out["choices"])}개')
            qs.append(out)
        have = {q['n'] for q in qs}
        for n in range(1, 51):
            if n not in have:
                report.append(f'{r}-{n}: 문항 없음')
        data = {'round': int(r), 'questions': qs}
        with open(os.path.join(ROOT, 'data', f'exam-{r}.js'), 'w') as f:
            f.write('HQ.add(' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ');\n')
    print('\n'.join(report) or 'OK')


if __name__ == '__main__':
    main(*sys.argv[1:4])
