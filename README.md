# VOKO Firebase MVP Baseline

한국 아티스트용 익명 커뮤니티를 위한 Firebase 중심 MVP 골격입니다.

## 포함된 구성

- `Next.js (App Router)`
- `Firebase Auth / Firestore / Cloud Functions` 기본 연동 구조
- `Firestore Rules` + `Indexes` 초안
- `신원확인 API`, `게시글 API`, `신고 API` 기본 라우트
- `관리자 콘솔 API + /admin 페이지`
- 신고 누적 5회 이상 게시글 `hidden` 처리 예시
- Firestore 기반 서버측 Rate limit
- 선택적 Firebase App Check 강제 검증

## 설치

1. 루트 의존성 설치

```bash
npm install
```

2. Functions 의존성 설치

```bash
cd functions
npm install
cd ..
```

3. 환경변수 설정

```bash
cp .env.example .env.local
```

`FIREBASE_PRIVATE_KEY`는 줄바꿈을 `\n` 형태로 넣어주세요.

추가 환경변수:
- `IDENTITY_PROVIDER_MODE=mock|provider`
- `IDENTITY_PROVIDER_VERIFY_URL` (실제 본인확인 연동 엔드포인트)
- `IDENTITY_PROVIDER_API_KEY`, `IDENTITY_PROVIDER_API_SECRET`
- `ENFORCE_APP_CHECK=true|false`

## 실행

```bash
npm run dev
```

브라우저: `http://localhost:3000`

## API

- `GET /api/posts`
- `POST /api/posts`
- `POST /api/reports`
- `POST /api/verify-identity`
- `GET /api/admin/reports?status=open`
- `POST /api/admin/reports/:reportId/resolve`
- `POST /api/admin/moderation-actions`

신원확인 테스트:

```bash
curl -X POST http://localhost:3000/api/verify-identity \
  -H "Content-Type: application/json" \
  -d '{"uid":"demo","ci":"sample-ci","verification_token":"mock-success-token"}'
```

## Firebase 파일

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/src/index.ts`

## 다음 권장 작업

1. 실제 본인확인 공급자(KCB/KMC/NICE 등) 검증 로직 연결
2. 관리자 콘솔(신고 처리/제재) UI 추가
3. Rate limiting(Functions + App Check) 강화

위 1~3은 현재 코드에 기본 구현되어 있으며, 실제 서비스에서는 각 공급자 계약정보/비밀키를 넣어 활성화하면 됩니다.
