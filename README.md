# 한능검 심화 기출노트 (60~79회)

한국사능력검정시험 심화 60~79회 기출을 회차별로 풀고, 선지를 나라·왕·인물별로 정리해 보는 정적 웹페이지.

## 여는 법
`index.html`을 브라우저로 바로 열면 된다(서버 불필요). 데이터는 `fetch` 없이 `<script>`로 불러오므로 `file://`에서도 동작한다.

## 구성
| 경로 | 내용 |
|---|---|
| `index.html` | 화면 틀과 스타일 |
| `app.js` | 회차별 풀이 / 나라별 선지·퀴즈 / 문화유산 갤러리 / 필기장(시대별 타임라인) 로직 |
| `cloud.js`, `config.js` | Supabase 로그인·동기화(선택) |
| `supabase/schema.sql` | Supabase 테이블·보안 규칙 |
| `data/exam-NN.js` | 회차별 문항·정답·선지 해설 (`HQ.add({...})`) |
| `data/concepts.js` | 개념 묶음 대표 문장 (`HQ.rep`) |
| `img/NN/QQ.jpg` | 문항 자료 이미지 (문제지 PDF에서 자름) |
| `img/NN/QQ-K.jpg` | 사진·그림 선지 K번 개별 이미지 |
| `build/build_data.py` | 해설 JSON + 정답표 + 개념 키 → `data/*.js` 생성 |
| `test+answer/` | 원본 문제지·정답표 PDF (저장소에는 올리지 않음) |

## 알려둘 점
- 65·72·75회 문제지 PDF는 1쪽이 정답표로 잘못 들어가 있어 1~4번 문항 이미지가 없다. 이 12문항은 공개 기출 자료를 검색해 텍스트로 복원했다.
- 63회 42번은 공식적으로 '정답 없음(전원 정답)' 처리된 문항이다.
- 선지 해설은 공식 해설이 아니다. 사진 선지 일부는 이름을 확정하지 못해 '(추정)'으로 표시했다.

## GitHub Pages 배포
사이트 주소: https://mtempem.github.io/korean_history/

1. GitHub에서 `korean_history` 저장소를 만들고 이 폴더를 push한다. `test+answer/`(시험지 PDF 원본)는 `.gitignore`로 빠진다.
2. 저장소 **Settings > Pages**에서 Source를 `Deploy from a branch`, Branch를 `main` / `/ (root)`로 저장한다.
3. 1~2분 뒤 위 주소로 열린다. 이후에는 push할 때마다 자동으로 갱신된다.

무료 계정의 GitHub Pages는 공개 저장소에서만 동작하므로, 저장소의 파일(문항 이미지 포함)은 누구나 볼 수 있다.

## 기록 저장과 Supabase 연결
필기·고른 답·채점 기록은 기본적으로 이 브라우저(localStorage)에만 저장된다. `config.js`에 Supabase 키를 넣으면 상단에 **로그인** 버튼이 생기고, 로그인한 사람의 기록이 Supabase에 저장되어 다른 기기에서도 이어진다. 로그인 전에 쓴 기록은 첫 로그인 때 자동으로 올라간다.

1. [supabase.com](https://supabase.com)에서 가입하고 새 프로젝트를 만든다(무료 요금제로 충분).
2. 대시보드 **SQL Editor**에 `supabase/schema.sql` 내용을 붙여 넣고 Run. → `progress` 테이블과 "자기 기록만 읽고 쓰기" 보안 규칙이 만들어진다.
   필기장도 동기화하려면 `supabase/notebook.sql`도 같은 방법으로 Run한다(`notebook` 테이블).
3. **Authentication > URL Configuration**: Site URL은 `https://mtempem.github.io/korean_history/`, Redirect URLs에는 `https://mtempem.github.io/korean_history/**`와 `http://localhost:8765/**`를 넣는다.
4. **Project Settings > API**의 Project URL과 `anon` public 키를 `config.js`에 넣는다. `service_role` 키는 절대 넣지 말 것.
5. Google 로그인 켜기
   - [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들고 **OAuth 동의 화면**(외부, 앱 이름·지원 이메일)을 설정한다.
   - **사용자 인증 정보 > OAuth 클라이언트 ID**(웹 애플리케이션)를 만든다.
     - 승인된 JavaScript 원본: `https://mtempem.github.io`, `http://localhost:8765`
     - 승인된 리디렉션 URI: `https://chugiaapralopactxzum.supabase.co/auth/v1/callback`
   - 받은 클라이언트 ID·보안 비밀을 Supabase **Authentication > Sign In / Providers > Google**에 넣고 켠다.

- 로그인은 Google 계정으로만 한다. 한 번 로그인하면 그 브라우저에서는 로그아웃 전까지 유지된다.
- 로그인은 웹 주소(http/https)로 열었을 때만 된다. `index.html` 파일을 더블클릭해 연 경우(`file://`)에는 브라우저에만 저장된다.
- 무료 프로젝트는 일주일가량 사용이 없으면 일시 정지된다. 대시보드에서 다시 켜면 된다.
- claude.ai 아티팩트는 외부 서버 접속을 막으므로 Supabase 동기화는 직접 호스팅한 사이트에서만 동작한다.

## claude.ai 아티팩트로 올릴 때
아티팩트는 버전당 파일 511개 제한이 있어 `img/`의 이미지 1,100여 개를 그대로 올릴 수 없다. 대신
```
python3 build/make_dist.py
```
를 실행하면 회차별 이미지를 `data/img-NN.js`로 묶은 `dist/` 폴더(약 40개 파일)가 생긴다. `dist/index.html`을 페이지로, 나머지를 `files`로 게시한다. 전체가 64MB를 넘으므로 `data/img-*.js`를 두 번에 나눠 같은 URL에 올린다.

## 데이터 다시 만들기
해설 원본은 `build/src/explain/NN.json`, 개념 묶음은 `build/src/concepts/*.json`, 나라별 정리에서 뺄 선지·옮길 선지는 `build/src/audit/*.false.json`에 있다. 고친 뒤:
```
python3 build/build_data.py
```
