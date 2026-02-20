# VOKO Sample Risk Checker (Free Mode)

프로듀서/아티스트용 샘플 사전 점검 웹앱입니다.
현재 버전은 **100% 무료 운영** 기준으로, 브라우저 내 신호 분석만 사용합니다.

## 현재 아키텍처

- Frontend: `Vite + React`
- Hosting: `Cloudflare Pages`
- 분석 방식: 클라이언트(브라우저) 내 로컬 분석
- 추적: Google Analytics + Microsoft Clarity
- 광고: Google AdSense 스크립트(클라이언트 값 교체 필요)

## 중요한 운영 원칙

- 이 서비스는 자동화된 **리스크 참고 도구**입니다.
- Spotify/YouTube Music 등 플랫폼의 최종 판정을 보장하지 않습니다.
- 상업 배포 전 라이선스/저작권 상태를 직접 확인해야 합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저: `http://localhost:5173`

## 배포 (Cloudflare Pages)

```bash
npm run build
npx wrangler pages deploy dist --project-name vokorealweek1
```

## 환경 변수 (선택)

- 기본 동작은 환경 변수 없이 동작합니다.
- AdSense 실제 적용 시 `index.html`의 `ca-pub-XXXXXXXXXXXXXXXX`를 실제 pub ID로 교체하세요.

## 향후 무료 확장 옵션

- Cloudflare Workers 무료 플랜으로 서버 분석 API 분리
- AcoustID 무료 키 연동 (선택)
- 내부 fingerprint 비교 DB 추가

## 참고

`firebase-functions/` 폴더는 실험용 코드로 남아있으며,
현재 배포/런타임 경로에는 포함되지 않습니다.
