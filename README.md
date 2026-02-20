# VOKO Firebase MVP Baseline

한국 아티스트용 익명 커뮤니티를 위한 Firebase 중심 MVP 골격입니다.

## 포함된 구성

- `Next.js (App Router)`
- `Firebase Auth / Firestore / Cloud Functions` 기본 연동 구조
- `Firestore Rules` + `Indexes` 초안
- Cloudflare Pages 정적 배포(`output: export`)
- Firebase Functions 백엔드 분리 구조(`firebase-functions/`)
- 신고 누적 5회 이상 게시글 `hidden` 처리 예시
- Firestore 기반 서버측 Rate limit
- 선택적 Firebase App Check 강제 검증

## 설치

1. 루트 의존성 설치

```bash
npm install
```

2. Firebase Functions 의존성 설치

```bash
cd firebase-functions
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

## 백엔드

- Pages 프로젝트는 정적 프론트만 배포
- 서버 API는 `firebase-functions/`를 별도 배포해 연결

## Firebase 파일

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `firebase-functions/src/index.ts`

## Cloudflare Pages 설정

- Build command: `npm run build`
- Build output directory: `out`
- Root directory: `/`

## 다음 권장 작업

1. 실제 본인확인 공급자(KCB/KMC/NICE 등) 검증 로직 연결
2. 관리자 콘솔(신고 처리/제재) UI 추가
3. Rate limiting(Functions + App Check) 강화

위 1~3은 현재 코드에 기본 구현되어 있으며, 실제 서비스에서는 각 공급자 계약정보/비밀키를 넣어 활성화하면 됩니다.
