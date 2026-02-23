# AI Context Pack (Current, 2026-02-23)

이 파일은 다른 AI가 이 레포를 한 번에 이해하도록 만든 단일 핸드오프 문서다.
코드 기준 최신 상태를 반영한다.

## 1) TL;DR

- 현재 런타임은 Vite + React 프론트엔드 단독.
- 핵심 로직은 `src/App.tsx`에 집중되어 있음.
- 앱은 AniList GraphQL로 카테고리 후보/최종 추천을 만들고, 한글 제목 보강을 위해 외부 API를 보조로 사용함.
- `firebase-functions/` 폴더는 존재하지만 현재 프론트 런타임 경로와 연결되지 않음.
- 최근 수정으로 Step2/최종추천 모두 카테고리 정합성 필터(`isCategoryAligned`)를 강제 적용함.

## 2) 실제 제품 동작

1. STEP1 카테고리 선택
   - 카테고리: `action`, `romance`, `healing`, `psychological`, `special`
   - 정의 위치: `src/App.tsx`의 `CATEGORIES`
2. STEP2 후보 목록 로딩 (`fetchCategoryAnimes`)
   - AniList 버킷 쿼리(`trending`, `popular`, `topRated`) 호출
   - 프랜차이즈 중복 제거
   - 카테고리 정합성 필터 적용(`filterByCategory`)
   - 서브카테고리 분배(`distributeBySubcategory`)로 카드 다양성 확보
3. 사용자가 기준 작품 선택 (최소 3, 최대 12)
4. 최종 추천 생성 (`makeFinalRecommendations`)
   - 시드 기반 추천 그래프 조회 (`RECOMMENDATION_QUERY`)
   - fallback/탐색 후보 조회 (`FINAL_CANDIDATE_QUERY`, `FINAL_CANDIDATE_EXPLORE_QUERY`)
   - 모든 후보에 카테고리 정합성 필터 재적용
   - 점수화 후 상위 4개 추천
5. 한글 제목 보강
   - 정적 매핑 -> 동의어/원제 -> API 기반 보강 순서

## 3) 최근 핵심 변경 (중요)

- 커밋: `62ece56`
- 내용: 카테고리 선택과 다른 장르가 Step2/결과에 섞이던 문제 수정
- 방식:
  - `isCategoryAligned`/`filterByCategory` 추가
  - Step2 수집 후보 전체에 필터 적용
  - 최종 추천의 그래프/fallback/explore/랭킹 직전 모두 필터 적용
  - 최종 후보 쿼리의 `genreIn`을 선택 카테고리로 고정

## 4) 핵심 파일 맵

- `src/main.tsx`: React 진입점
- `src/App.tsx`: 카테고리/쿼리/추천 알고리즘/한글화 로직/상태관리
- `src/styles.css`: UI 스타일
- `src/api/localizeAnimeClient.ts`: 선택적 한글화 API 클라이언트
- `src/data/koTitleFallbackRepo.ts`: 정적 한글 제목 fallback 데이터
- `index.html`: GA/Clarity/AdSense 스크립트

## 5) 외부 API 사용 현황

핵심 추천:
- AniList GraphQL: `https://graphql.anilist.co`

한글 제목 보강:
- Wikidata SPARQL: `https://query.wikidata.org/sparql`
- Wikipedia API(langlinks): `https://{en|ja}.wikipedia.org/w/api.php`
- TMDB Search API: `https://api.themoviedb.org/3/search/multi` (옵션, 키 필요)

선택적 내부/외부 한글화 엔드포인트:
- `VITE_LOCALIZE_ANIME_ENDPOINT` (옵션)
- 클라이언트: `src/api/localizeAnimeClient.ts`

분석/광고 스크립트(앱 기능 API와 별개):
- Google Analytics
- Microsoft Clarity
- Google AdSense

## 6) 환경 변수

필수 환경 변수는 없음.

선택:
- `VITE_TMDB_API_KEY`: TMDB 기반 제목 보강 활성화
- `VITE_LOCALIZE_ANIME_ENDPOINT`: 커스텀 로컬라이즈 API 활성화

## 7) 실행/검증 명령

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run preview
```

## 8) 배포 메모

- 정적 빌드 산출물은 `dist/`
- Cloudflare Pages 배포 시 반드시 `dist`를 배포해야 함
- 잘못 루트 배포 시 `index.html`이 `/src/main.tsx`를 참조해 런타임 에러가 발생할 수 있음

## 9) 작업 시 주의점

- `README.md` 설명은 현재 코드와 일부 불일치할 수 있음. 코드 기준으로 판단해야 함.
- `firebase-functions/`는 현재 프론트 동작 경로 밖의 잔존 코드이므로, 요청이 없으면 건드리지 않는 것이 안전함.
- 기능 수정은 대부분 `src/App.tsx`에서 끝남.

## 10) 다른 AI에게 바로 붙여넣는 프롬프트

```text
너는 /home/user/voko-real-week1 레포를 작업한다.
현재 실제 런타임은 Vite+React 프론트엔드 단독이며 핵심 로직은 src/App.tsx에 있다.
카테고리(action/romance/healing/psychological/special) 기반 애니 추천 서비스다.
Step2 후보와 최종 추천 모두 isCategoryAligned 필터로 카테고리 정합성을 강제한다.
추천 데이터는 AniList GraphQL에서 가져오고, 한글 제목 보강은 정적 fallback + Wikidata/Wikipedia/TMDB/선택적 로컬라이즈 API를 사용한다.
firebase-functions 폴더는 현재 프론트 런타임과 연결되지 않는다.
작업 시작 시 src/App.tsx, src/api/localizeAnimeClient.ts, src/styles.css, index.html, package.json 순으로 확인하라.
README보다 코드 기준을 우선하라.
```

