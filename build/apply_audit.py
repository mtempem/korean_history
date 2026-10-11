"""개념 묶음 점검 결과(build/src/audit/*.fix.json)를 build/src/concepts/*.json 에 반영한다.

사용: python3 build/apply_audit.py
"""
import glob, json, os

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
for fix_path in sorted(glob.glob(os.path.join(SRC, 'audit', '*.fix.json'))):
    g = os.path.basename(fix_path).split('.')[0]
    con_path = os.path.join(SRC, 'concepts', f'{g}.json')
    fix, con = json.load(open(fix_path)), json.load(open(con_path))
    unknown = [i for i in fix.get('keys', {}) if i not in con['keys']]
    con['keys'].update({i: k for i, k in fix.get('keys', {}).items() if i in con['keys']})
    con['rep'].update(fix.get('rep', {}))
    json.dump(con, open(con_path, 'w'), ensure_ascii=False)
    print(g, 'keys', len(fix.get('keys', {})), 'rep', len(fix.get('rep', {})), 'unknown ids', unknown)
