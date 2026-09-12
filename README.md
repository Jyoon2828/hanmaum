# 마음에 머무는 말씀

대행선사 법어를 공개 CSV에서 선택하거나 직접 입력한 글을 사진과 합성하여 PNG로 저장하는 정적 웹앱입니다. 서버, 로그인, 데이터베이스, Google Apps Script, Google Sheets API, API 키, 유료 API를 사용하지 않습니다.

## 현재 자료 준비 상태

제공하신 공개 스프레드시트의 Quotes 시트와 PNG 배경 6장을 연결했습니다. 검증 시 TRUE 조건을 만족하는 법어 10개를 읽었습니다. 우주탑은 제공된 colored-pencil-ujutap.png 원본을 사용합니다.

현재 스프레드시트는 공개 공유 상태이며 gviz CSV 내보내기로 로그인 없이 읽을 수 있습니다. 웹에 게시 주소는 HTTP 401로 열리지 않아 현재 작동하는 공개 CSV 주소를 config.js에 연결했습니다. Google Sheets API·API 키를 사용하지 않습니다. 웹에 게시 후에는 config.js의 주소만 교체하면 됩니다.

## 기능과 파일

- 법어/직접 입력 탭, 법어 바텀시트, 최대 260자와 선택 출처 입력
- 공개 CSV의 verified/enabled 필터, 숫자 정렬, 재시도, 마지막 정상 CSV 캐시
- 배경 분류, 내 사진, 배경 추천 위치·색상, 다른 조합 추천
- 한글 폰트 6종, 실제 글자 측정으로 자동 크기 조절, 위치·정렬·색상·가독성
- 1080×1350 / 1080×1080 PNG 저장, 지원 기기의 파일 공유, 다운로드 대체 동작
- 모바일 한 열, 넓은 화면 두 열, 키보드 탭 전환, ESC로 닫는 바텀시트

```text
mind-card/
  index.html       화면과 Google Fonts 연결
  styles.css       반응형 디자인
  app.js           CSV·편집·Canvas·공유 및 배경 등록 배열
  config.js        공개 CSV 주소 한 곳에서 설정
  README.md        사용·설정·배포 안내
  VALIDATION.md    실제 검증 결과와 남은 확인 사항
  assets/         원본 배경을 넣는 폴더
```

## 1. 배경 이미지 넣기

PNG 배경 6장은 이미 `assets`에 포함되어 있습니다(1122×1402px). 교체 시 세로 4:5, 최소 1080×1350px, 권장 1600×2000px 정도의 PNG/JPG/WebP가 좋습니다. 한마음선원 우주탑은 최종 수정된 실제 형태의 색연필 원본을 사용하고 동자승 이미지는 넣지 마세요.

배경은 `app.js` 첫 부분의 `BACKGROUNDS`에 등록되어 있습니다. 아래와 같은 구조로 관리하며 교체 파일명이 다르면 `src`를 실제 이름에 맞추세요.

```javascript
const BACKGROUNDS = [
  { id: 'bg01', title: '연꽃과 새벽 연못', category: '수채화', src: './assets/watercolor-lotus.png', recommendedPosition: 'top', recommendedColor: '#513a2d' },
  { id: 'bg02', title: '고요한 사찰', category: '수채화', src: './assets/watercolor-temple.png', recommendedPosition: 'middle', recommendedColor: '#292d2c' },
  { id: 'bg03', title: '연꽃과 새', category: '색연필', src: './assets/colored-pencil-lotus-bird.png', recommendedPosition: 'top', recommendedColor: '#513a2d' },
  { id: 'bg04', title: '한마음선원 우주탑', category: '색연필', src: './assets/colored-pencil-ujutap.png', recommendedPosition: 'top', recommendedColor: '#292d2c' },
  { id: 'bg05', title: '사찰의 풍경', category: '실사', src: './assets/photo-temple.png', recommendedPosition: 'bottom', recommendedColor: '#ffffff' },
  { id: 'bg06', title: '연꽃의 시간', category: '실사', src: './assets/photo-lotus.png', recommendedPosition: 'middle', recommendedColor: '#ffffff' }
];
```

등록 이미지를 먼저 로딩하고 성공한 이미지만 선택 목록에 표시합니다. 실패한 이미지 수는 화면에 안내합니다. 첫 이미지가 기본 선택되며 추천 위치와 색상을 적용합니다. `＋ 내 사진`은 JPG·PNG·WebP(최대 30MB)를 지원하며 선택한 파일은 업로드하거나 보관하지 않습니다. 새로고침하면 직접 입력 및 사진 선택은 초기화됩니다. 탭 전환 중에는 유지됩니다.

## 2. Quotes 시트 만들기

Google 스프레드시트를 만들고 시트 이름을 `Quotes`로 지정하세요. 첫 행에 다음 열 제목을 정확히 입력합니다.

| 열 | 의미 |
|---|---|
| id | 중복 없는 고유 번호 |
| category | 법어 분류 |
| text | 확인된 원문, 쉼표·따옴표·줄바꿈 허용 |
| author | 작성자 |
| source | 책 또는 법문 출처 |
| verified | 원문 확인을 마쳤으면 TRUE |
| enabled | 공개하려면 TRUE, 숨기려면 FALSE |
| sortOrder | 작은 숫자부터 표시 |

법어는 코드가 아니라 이 시트에서 추가·수정하세요. verified와 enabled가 모두 TRUE인 행만 표시됩니다(대소문자 무관). 빈 원문·빈 id·중복 id는 제외하고, sortOrder가 숫자가 아니면 마지막에 배치합니다. 공백 sortOrder는 0으로 취급합니다. 원문을 자동으로 요약하거나 수정하지 않습니다. 법어 선택 목록에서는 시트의 작성자와 출처를 표시하고, 포함 관계인 중복 문구는 한 번만 표시합니다.

**사용자 요청에 따라 법어 카드의 문장 아래에는 정확히 `-대행선사 법어-`만 표시합니다.** 직접 입력 모드에서는 사용자가 입력한 출처만 그대로 표시합니다.

**공개 전에 모든 법어 원문과 출처를 공식 자료와 대조하세요. 공개 스프레드시트에는 개인정보나 비공개 자료를 넣지 마세요.**

## 3. CSV로 게시하고 연결하기

1. 스프레드시트에서 `파일 → 공유 → 웹에 게시`를 엽니다.
2. 전체 문서 대신 `Quotes` 시트를 고릅니다.
3. 형식으로 `쉼표로 구분된 값(.csv)`을 선택하고 게시합니다.
4. 생성된 공개 CSV 주소를 복사합니다. 일반 편집/공유 링크가 아닙니다.
5. `config.js`의 현재 CSV 주소를 새 게시 주소로 교체하고 저장합니다. 제공된 시트의 공개 CSV 주소는 이미 설정되어 있어 바로 실행할 수 있습니다.

```javascript
window.APP_CONFIG = {
  QUOTES_CSV_URL: "https://docs.google.com/spreadsheets/d/e/게시ID/pub?gid=시트ID&single=true&output=csv"
};
```

위 주소는 형식 설명이며 실제 주소로 교체해야 합니다. index.html은 config.js 다음 app.js 순서로 실행합니다. 주소가 비어 있으면 설정 대기 안내를 표시합니다. 다시 불러오기를 누르거나 페이지를 새로고침하면 최신 CSV를 요청합니다. 자동 주기 조회는 하지 않습니다.

마지막 정상 CSV만 localStorage에 저장합니다. 네트워크 오류 때 같은 CSV 주소의 캐시를 이용하며 `저장된 말씀을 보여 드리고 있습니다.`를 표시합니다. 저장 공간을 사용할 수 없어도 편집 기능은 동작합니다. 입력한 개인 문구·출처·사진은 localStorage에 저장하지 않습니다.

## 4. 로컬에서 실행하기

index.html을 직접 열어 기본 편집을 사용할 수도 있지만, CSV 연동과 공유 확인은 HTTP 환경을 권장합니다. VS Code의 Live Server를 사용하거나 Python이 설치되어 있다면 mind-card 폴더에서 다음을 실행합니다.

```sh
python -m http.server 8080
```

브라우저에서 `http://localhost:8080`을 여세요. 이 서버는 개발 미리보기용이며 배포에는 필요하지 않습니다. Google Fonts와 공개 CSV를 처음 불러올 때는 인터넷 연결이 필요합니다. 서버 프로그램이나 패키지를 웹앱에 설치할 필요는 없습니다.

## 5. GitHub Pages 배포

1. GitHub에 저장소를 만들고 **mind-card 폴더 안의 파일들**을 저장소 최상위에 올립니다.
2. assets 안의 이미지와 config.js도 포함합니다.
3. 저장소의 `Settings → Pages`에서 `Deploy from a branch`를 선택합니다.
4. 파일이 있는 브랜치와 `/(root)`를 선택하고 저장합니다.
5. 배포가 끝나면 표시된 `https://사용자.github.io/저장소/` 주소를 엽니다.

모든 앱 리소스는 `./` 상대경로이므로 저장소 하위 주소에서 동작합니다. 별도 빌드나 라우팅 설정은 없습니다.

## 6. Vercel 배포

1. 위 파일들을 GitHub 저장소에 올립니다.
2. Vercel에서 새 프로젝트를 만들고 저장소를 가져옵니다.
3. Framework Preset은 `Other`를 선택합니다.
4. Root Directory는 index.html이 있는 폴더로 지정합니다.
5. Build Command는 비워 두고, Output Directory는 `.`으로 지정합니다.
6. Deploy를 실행하고 제공된 HTTPS 주소를 엽니다.

환경 변수, API 키, 서버 함수가 필요 없습니다. 원본 코드나 config.js 수정 후 다시 배포하면 적용됩니다.

## 문제 해결

- **배경이 안 보임:** 실제 파일과 src의 이름·확장자·대소문자가 일치하는지 확인하세요. `.png`로 이름만 바꾼 JPEG가 아닌 올바른 PNG 원본을 사용하세요. `/assets/` 대신 `./assets/`를 사용하세요. 외부 이미지 URL 대신 로컬 assets를 사용해야 Canvas 저장에서 출처 제한 문제가 없습니다.
- **법어를 못 불러옴:** 웹에 게시가 활성화되었는지, CSV 주소를 로그인 없이 열 수 있는지, Quotes 시트와 열 제목이 정확한지 확인하세요. 일반 공유 링크와 HTML 페이지는 CSV가 아닙니다.
- **표시할 법어 없음:** verified·enabled가 모두 TRUE인지, text·id가 비어 있지 않은지 확인하세요.
- **갱신이 늦음:** 다시 불러오기를 누르고, 원본 시트의 웹 게시 설정 및 자동 재게시 설정을 확인하세요. 요청에 현재 시각을 붙이고 브라우저 캐시를 사용하지 않지만 Google의 게시 반영 지연은 있을 수 있습니다. 캐시 안내가 뜨면 네트워크를 확인하세요.
- **폰트 오류:** fonts.googleapis.com과 fonts.gstatic.com에 연결되는지 확인한 뒤 폰트 버튼을 다시 누르세요. 선택 폰트가 로드되지 않은 상태에서는 잘못된 폰트로 저장하지 않고 안내합니다.
- **내 사진 오류:** JPG·PNG·WebP 형식으로 변환 후 선택하세요. 파일이 손상되었거나 너무 크면 다른 사진을 사용하세요.
- **저장/공유:** 글이 공백이면 저장하지 않습니다. 이미지 공유는 HTTPS와 브라우저 지원이 필요합니다. 미지원 또는 공유 창 열기 실패 시 PNG 다운로드로 대체합니다. 공유 취소는 오류로 표시하지 않습니다. Android Chrome에서 파일/다운로드 앱을 확인하세요.
- **매우 긴 글:** 안전 여백 안에 본문과 출처를 담도록 축소합니다. 비정상적으로 긴 공개 원문이나 많은 빈 줄은 아주 작아질 수 있으므로 미리보기를 확인하세요. 직접 입력은 260자까지입니다.

Google Fonts 및 공개 CSV 요청 외에 분석·추적·개인정보 수집 기능은 없습니다. 사용자 입력은 화면과 Canvas에서만 처리되며 네트워크 요청에 포함되지 않습니다. Google Fonts에 보내는 요청도 고정 폰트 CSS/파일 URL이며 사용자 문구를 URL에 넣지 않습니다.
