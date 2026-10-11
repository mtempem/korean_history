"""claude.ai 아티팩트 게시용 dist/ 폴더를 만든다.

아티팩트는 버전당 파일 수가 511개로 제한되어 img/ 의 이미지 1,100여 개를 그대로 올릴 수 없다.
그래서 회차별 이미지를 data URI로 묶어 data/img-NN.js (HQ.imgs) 로 만들고, index.html 에 그 스크립트를 추가한다.
결과: dist/index.html, dist/app.js, dist/data/*.js  (약 40개 파일, 약 70MB → 두 번에 나눠 게시)
사용: python3 build/make_dist.py
"""
import base64, glob, json, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(os.path.join(DIST, 'data'))
shutil.copy(os.path.join(ROOT, 'app.js'), DIST)
for f in glob.glob(os.path.join(ROOT, 'data', '*.js')):
    shutil.copy(f, os.path.join(DIST, 'data'))
tags = []
for d in sorted(glob.glob(os.path.join(ROOT, 'img', '*'))):
    r = os.path.basename(d)
    imgs = {f'img/{r}/{os.path.basename(f)}': 'data:image/jpeg;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
            for f in sorted(glob.glob(os.path.join(d, '*.jpg')))}
    with open(os.path.join(DIST, 'data', f'img-{r}.js'), 'w') as f:
        f.write('HQ.imgs=Object.assign(HQ.imgs||{},' + json.dumps(imgs, separators=(',', ':')) + ');\n')
    tags.append(f'<script src="data/img-{r}.js"></script>')
html = open(os.path.join(ROOT, 'index.html')).read()
html = html.replace('<script src="app.js"></script>', '\n'.join(tags) + '\n<script src="app.js"></script>')
open(os.path.join(DIST, 'index.html'), 'w').write(html)
print(len(os.listdir(os.path.join(DIST, 'data'))) + 2, 'files')
