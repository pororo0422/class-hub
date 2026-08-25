# 우리 반 알림장 (베타)

공지 · 숙제 · 날짜 투표 · 달력 · 건의함이 들어간 학급용 웹사이트.

## 실행하기

```bash
cd class-hub
npm install
npm start
```

브라우저에서 http://localhost:3000 열면 돼.
코드 고치면서 자동 재시작 하려면 `npm run dev`.

**반장 모드 비밀번호는 `class1234`** — `server.js` 위쪽 `ADMIN_KEY`에서 바꾸면 돼.
**지금은 공지·숙제·일정·투표·건의 전부 반 전체가 올리고 지울 수 있어.** 반장 모드가 따로 잠그는 건 없음.
다시 잠그고 싶으면 `server.js`의 `requireAdmin`을 해당 라우터에 끼워 넣으면 돼 (함수 위 주석 참고).

## 폴더 구조

```
class-hub/
├─ server.js            API 서버 (Express)
├─ package.json
├─ data/
│  ├─ db.json           실제 데이터 (자동 생성/수정)
│  └─ sample.json       화면 미리 보고 싶을 때 db.json에 덮어쓰기
└─ public/
   ├─ index.html        화면 뼈대
   ├─ styles.css        디자인 (모눈종이 + 형광펜 컨셉)
   └─ app.js            화면 그리기 + 서버 통신
```

## 어떻게 돌아가는지

- 서버가 `/api/state`로 전체 데이터를 한 번에 내려주고, `app.js`가 탭별로 그려.
- 데이터는 `data/db.json` 파일에 저장돼. DB 설치 필요 없음.
- 이름은 브라우저에 저장돼서 (localStorage) 숙제 체크·투표할 때 누구 건지 구분해.

## API

**전부 반 전체에게 열려 있음.** 반장 전용 기능은 지금 없음.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/state` | 전체 데이터 |
| POST | `/api/notices` | 공지 올리기 (이름 필요) |
| PATCH | `/api/notices/:id/pin` | 고정/해제 |
| DELETE | `/api/notices/:id` | 공지 삭제 |
| POST | `/api/homework` | 숙제 올리기 (이름 필요) |
| POST | `/api/homework/:id/done` | 다 했어요 체크 |
| DELETE | `/api/homework/:id` | 숙제 삭제 |
| POST | `/api/polls` | 투표 만들기 |
| POST | `/api/polls/:id/vote` | 투표하기 |
| POST | `/api/polls/:id/close` | 날짜 확정 → 달력 등록 |
| DELETE | `/api/polls/:id` | 투표 삭제 |
| POST | `/api/events` | 일정 추가 |
| DELETE | `/api/events/:id` | 일정 삭제 |
| POST | `/api/suggestions` | 건의 남기기 |
| POST | `/api/suggestions/:id/reply` | 답변 달기 |
| DELETE | `/api/suggestions/:id` | 건의 삭제 |
| PATCH | `/api/class-name` | 반 이름 변경 |

## 고칠 때 참고

**반 이름 바꾸기** — `data/db.json`의 `className` 값을 직접 고치거나, 반장 모드에서 `/api/class-name` 호출.

**색·글꼴 바꾸기** — `styles.css` 맨 위 `:root` 변수만 바꾸면 전체가 따라 바뀜.

**MongoDB로 옮기기** — `server.js`의 `readDB()` / `writeDB()` 두 함수만 Mongo 쿼리로 갈아끼우면 라우터는 거의 그대로 써도 돼.

**밖에서 접속하게 하기** — 지금은 내 컴퓨터에서만 돌아가. 반 애들이 쓰려면 Render나 Railway 같은 데 올려야 하고, 그때 `db.json` 파일 저장 방식은 MongoDB Atlas로 바꾸는 게 안전해 (배포 서버는 재시작하면 파일이 날아가는 경우가 많음).

## 아직 없는 것 (다음에 붙이면 좋을 것)

- 로그인 (지금은 이름을 직접 입력하는 방식이라 아무나 남의 이름 쓸 수 있음)
- 알림 (카톡/메일)
- 숙제 완료 안 한 사람 목록
- 시간표
