# 우리 반 알림장 (베타)

공지 · 숙제 · 날짜 투표 · 달력 · 건의함이 들어간 학급용 웹사이트.

**https://pororo0422.github.io/class-hub/**

GitHub Pages(정적 사이트) + Firebase Firestore(데이터) 구조라 서버가 따로 없고,
잠들지도 않고, 돈도 안 들어. 누가 글을 올리면 다른 애들 화면에 새로고침 없이 바로 뜸.

---

## 처음 한 번만 하는 설정

### 1. Firebase 프로젝트 만들기

1. [console.firebase.google.com](https://console.firebase.google.com) → 구글 계정으로 로그인
2. **프로젝트 추가** → 이름 아무거나 (예: `class-hub`) → Google 애널리틱스는 **사용 안 함**으로 꺼도 됨
3. 왼쪽 메뉴 **빌드 → Firestore Database** → **데이터베이스 만들기**
   - 위치는 `asia-northeast3 (서울)` 추천
   - 모드는 아무거나 골라도 됨 (3번에서 어차피 덮어씀)

### 2. 웹 앱 등록하고 설정값 복사

1. 프로젝트 개요 옆 **⚙️ → 프로젝트 설정**
2. 아래로 내려서 **내 앱 → 웹(`</>`) 아이콘** 클릭 → 앱 이름 아무거나 → 등록
3. `const firebaseConfig = { ... }` 부분이 나오면 중괄호 안의 값을 통째로 복사
4. **`public/firebase-config.js`** 를 열어서 그 값을 붙여넣기
5. 같은 파일 아래쪽 `ADMIN_KEY` 를 반장 모드 비밀번호로 바꾸기

### 3. 접근 규칙 붙여넣기 ⚠️ 이거 안 하면 30일 뒤에 멈춤

1. **Firestore Database → 규칙** 탭
2. 이 저장소의 **`firestore.rules`** 내용을 통째로 복사해서 덮어쓰기
3. **게시(Publish)**

Firebase가 처음에 만들어 주는 "테스트 모드" 규칙은 **30일 뒤에 만료**돼서
어느 날 갑자기 사이트가 안 돌아가. 꼭 바꿔놓을 것.

### 4. GitHub Pages 켜기

1. GitHub 저장소 → **Settings → Pages**
2. **Source** 를 **GitHub Actions** 로 바꾸기
3. `main` 에 push하면 `.github/workflows/deploy.yml` 이 알아서 배포함
4. 주소는 `https://<내아이디>.github.io/<저장소이름>/`

---

## 로컬에서 고칠 때

```bash
npm start
```

http://localhost:3000 을 열면 돼. 설치할 건 없어 — 딸린 패키지가 하나도 없어서
node만 있으면 바로 돌아가. 데이터는 로컬에서도 Firebase를 보기 때문에
**켜놓은 화면과 배포된 사이트가 같은 데이터를 씀.** 연습용으로 막 눌러보면
반 애들 화면에도 그대로 보이니까 주의.

> `file://` 로 `index.html` 을 직접 열면 안 돼. 브라우저가 모듈 파일을 막아서
> 꼭 `npm start` 처럼 주소가 `http://` 인 상태로 열어야 함.

## 폴더 구조

```
├─ public/                 ← 이 폴더가 통째로 사이트가 됨
│  ├─ index.html           화면 뼈대
│  ├─ styles.css           디자인 (모눈종이 + 형광펜 컨셉)
│  ├─ app.js               화면 그리기 + 이벤트 처리
│  ├─ data.js              Firebase 연결 (예전 server.js가 하던 일)
│  └─ firebase-config.js   ← 내 Firebase 설정값 (여기만 채우면 됨)
├─ firestore.rules         누가 뭘 읽고 쓸 수 있는지
├─ .github/workflows/
│  └─ deploy.yml           push하면 자동 배포
└─ server.js               로컬에서 볼 때 쓰는 정적 서버 (52줄, 딸린 패키지 없음)
```

`public/` 폴더가 사이트의 전부야. `server.js`는 로컬에서 볼 때만 쓰고
배포에는 안 올라가.

## 어떻게 돌아가는지

- `data.js`가 Firestore를 실시간으로 구독하고 있어서, 데이터가 바뀌면
  `app.js`의 `applyState()`가 불려서 화면을 다시 그려.
- `data.js`는 **예전 서버 주소를 그대로 흉내 내**. `api("POST", "/api/notices", {...})`
  같은 식이라, 화면 코드는 서버가 사라진 걸 모르고 그대로 돌아가.
- 이름은 브라우저에 저장돼서(localStorage) 숙제 체크·투표할 때 누구 건지 구분해.

## 데이터가 저장되는 곳 (Firestore)

| 컬렉션 | 뭐가 들어있나 |
|---|---|
| `notices` | 공지 — `title`, `body`, `author`, `pinned`, `createdAt` |
| `homework` | 숙제 — `subject`, `title`, `detail`, `due`, `author`, `doneBy[]` |
| `polls` | 날짜 투표 — `options[]`, `votes{이름:[옵션id]}`, `closed`, `decidedOptionId` |
| `events` | 달력 일정 — `title`, `date`, `time`, `place`, `memo` |
| `suggestions` | 건의 — `body`, `author`, `replies[]` |
| `meta/class` | 반 이름 (`className`) |

Firebase 콘솔의 **Firestore Database → 데이터** 탭에서 직접 보고 고칠 수도 있어.

## 고칠 때 참고

**반 이름 바꾸기** — Firebase 콘솔에서 `meta/class` 문서의 `className` 값을 고치면 됨.

**색·글꼴 바꾸기** — `styles.css` 맨 위 `:root` 변수만 바꾸면 전체가 따라 바뀜.

**삭제를 반장만 하게 막기** — 지금은 누구나 지울 수 있어. 진짜로 막으려면
`firestore.rules`에서 `allow write` 를 조건부로 바꿔야 해 (Firebase 로그인 붙이는 게 정석).

## 알아둘 것

- **주소를 아는 사람은 누구나 쓰고 지울 수 있어.** 로그인이 없고 이름을 직접
  입력하는 방식이라, 남의 이름을 쓰는 것도 막지 못해. 주소는 반 단톡에만 뿌리기.
- **반장 모드는 진짜 자물쇠가 아니야.** 비밀번호가 `firebase-config.js`에 들어있고
  이 파일은 브라우저로 내려가니까 마음먹으면 찾아볼 수 있어. 화면 정리 용도로만 생각할 것.
- Firebase 무료 한도는 하루 읽기 5만 / 쓰기 2만 번이야. 반 하나가 쓰는 정도면 한참 남아.

## 아직 없는 것

- 로그인 (구글 로그인 붙이면 위의 보안 문제가 대부분 해결됨)
- 알림 (카톡/메일)
- 숙제 완료 안 한 사람 목록
- 시간표
