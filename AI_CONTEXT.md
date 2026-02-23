# AI Context Pack (Current Runtime)

이 문서는 **다른 AI가 이 레포를 한 번에 이해하도록** 현재 실제 구동 구조를 압축 정리한 핸드오프 문서다.

## 1) 한 줄 요약

현재 운영 경로는 **Vite + React 단일 프론트엔드**이며, 브라우저에서 AniList GraphQL을 직접 호출해 애니 추천을 생성한다. `firebase-functions/`는 레포에 존재하지만 현재 프론트엔드 런타임 경로에는 연결되지 않는다.

## 2) 실제 런타임 아키텍처

- Client: `src/main.tsx` -> `src/App.tsx`
- Build/Dev: Vite (`package.json` scripts: `dev`, `build`, `preview`)
- External APIs (브라우저 직접 호출):
  - AniList GraphQL: `https://graphql.anilist.co`
  - Wikidata SPARQL: `https://query.wikidata.org/sparql`
  - Wikipedia API (`en`, `ja` -> `ko` langlinks)
  - TMDB Search API (옵션): `VITE_TMDB_API_KEY`가 있을 때만 사용
- Tracking scripts (HTML head):
  - Google Analytics (gtag)
  - Microsoft Clarity
  - Google AdSense placeholder script

## 3) 사용자 플로우 (App.tsx 기준)

1. 카테고리 선택 (`lovecom`, `action`, `fantasy`, `thriller`)
2. AniList에서 카테고리 버킷 데이터 조회
   - `trending`, `popular`, `topRated` 3개 쿼리 결과 합침
   - 프랜차이즈 중복 제거 + 셔플 후 카드 노출
3. 사용자가 기준 작품 3~6개 선택
4. 최종 추천 생성
   - seed 작품 기준 추천 그래프(`RECOMMENDATION_QUERY`) 조회
   - 장르/태그 기반 fallback 후보(`FINAL_CANDIDATE_QUERY`) 조회
   - 커스텀 스코어링 후 상위 4개 출력
5. 한글 제목 보강
   - 정적 맵 -> 동의어/원제 Hangul -> Wikidata -> Wikipedia -> TMDB 순서
   - `localStorage`(`voko_ko_title_cache_v1`)에 캐시

## 4) 핵심 파일 맵

- `src/main.tsx`: React 진입점
- `src/App.tsx`: 제품 로직 대부분(쿼리, 추천 알고리즘, 상태 관리, 제목 보강)
- `src/styles.css`: 전체 UI 스타일 및 반응형
- `index.html`: GA/Clarity/AdSense 로드 + root mount
- `vite.config.ts`: React plugin + `@` alias(`./src`)
- `README.md`: 운영 설명이 일부 최신 코드와 불일치 가능(아래 참고)

## 5) 현재 코드베이스에서 혼동하기 쉬운 점

- `README.md`의 서비스 설명(샘플 리스크 체커)과 현재 `src/App.tsx`의 실제 UI/기능(애니 추천기)이 서로 다름.
- `firebase-functions/`는 분석 파이프라인/신원검증/신고 처리 코드가 있으나, 현재 프론트엔드 앱에서는 해당 함수를 호출하지 않음.
- 즉, "현재 사이트 동작"을 설명할 때는 **프론트엔드 단독 동작**을 기준으로 봐야 함.

## 6) Firebase 관련 코드의 상태

존재하는 기능(레포 기준):
- Callable: `verifyIdentity`, `reportContent`, `createAnalysisRequest`
- Trigger/Scheduler: `onAnalysisRequestCreated`, `cleanupExpiredFiles`
- 분석 관련: AcoustID 조회, 내부 해시 매칭, 리스크 스코어링

하지만 현재 프론트 앱(`src/`)과는 연결 코드가 보이지 않는다.

## 7) 실행/검증 명령

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

## 8) 환경 변수

프론트 필수는 아님. 선택적 변수:

- `VITE_TMDB_API_KEY`: 한글 제목 보강 정확도 향상(TMDB 조회 활성화)

백엔드(레포 보관용) 관련 예시는 `.env.example` 참조.

## 9) 다른 AI에게 바로 전달할 프롬프트

아래를 그대로 붙여 넣으면 컨텍스트 로딩이 빠르다.

```text
너는 /home/user/voko-real-week1 레포를 작업한다.
현재 실제 런타임은 Vite+React 프론트엔드 단독이며, 핵심 로직은 src/App.tsx에 있다.
사이트는 AniList GraphQL을 브라우저에서 직접 호출해 카테고리 기반 애니 추천을 생성한다.
최종 추천은 추천 그래프 + 장르/태그 fallback + 커스텀 점수로 상위 4개를 선택한다.
한글 제목은 정적 맵/동의어/Wikidata/Wikipedia/TMDB 순으로 보강하고 localStorage에 캐시한다.
index.html에는 GA/Clarity/AdSense 스크립트가 포함된다.
firebase-functions 폴더는 존재하지만 현재 프론트 런타임 경로에 연결되지 않은 잔존 코드로 취급하라.
작업 시 우선 읽을 파일: src/App.tsx, src/styles.css, src/main.tsx, index.html, package.json.
README 설명과 현재 앱 동작이 일부 불일치할 수 있으니 코드 기준으로 판단하라.
```

## 10) 빠른 체크리스트 (AI용)

- 현재 기능 수정: `src/App.tsx` 중심
- UI/반응형 수정: `src/styles.css`
- 초기 스크립트/메타: `index.html`
- 실행 오류 확인: `npm run dev` / `npm run build`
- Firebase 기능 변경 요청이 아닌 이상 `firebase-functions/`는 기본적으로 건드리지 않음
