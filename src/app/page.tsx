export default function Home() {
  const verifyIdentityCurl =
    "curl -X POST http://localhost:3000/api/verify-identity -H 'Content-Type: application/json' -d '{\"uid\":\"demo\",\"ci\":\"sample-ci\",\"verification_token\":\"mock-success-token\"}'";

  const collections = [
    "users",
    "boards",
    "posts",
    "comments",
    "reports",
    "moderation_actions",
  ];

  const endpoints = [
    "GET /api/posts",
    "POST /api/posts",
    "POST /api/reports",
    "POST /api/verify-identity",
  ];

  return (
    <div className="page">
      <section className="hero">
        <div>
          <div className="brand">
            <div className="logo">VOKO</div>
            <div>
              <p className="meta">Firebase-first MVP</p>
              <h1>한국 아티스트 익명 커뮤니티 초기 골격</h1>
            </div>
          </div>
          <p>
            익명 노출과 신원확인을 분리한 구조를 기준으로, Firestore/Functions/Rules를
            먼저 붙인 상태입니다. 플러그인을 바꿔도 Firebase를 중심으로 유지됩니다.
          </p>
          <div className="pill-row">
            <span className="pill">Firebase Auth</span>
            <span className="pill">Firestore Rules</span>
            <span className="pill">Cloud Functions</span>
            <span className="pill">Moderation Queue</span>
          </div>
          <div className="button-row">
            <a className="button" href="/admin">Admin Console 열기</a>
          </div>
        </div>
        <div className="hero-card">
          <h3>현재 포함된 구현</h3>
          <p>신원확인, 게시글 생성, 신고 누적 숨김(5회), Firestore 인덱스/룰.</p>
          <div className="pill-row">
            <span className="ticker">v0.1 ◉ API READY</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Firestore Collections</h2>
        <div className="grid-2">
          {collections.map((name) => (
            <article className="post" key={name}>
              <div className="card-header">
                <span className="title">{name}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>API Endpoints</h2>
        <div className="grid-2">
          {endpoints.map((endpoint) => (
            <article className="post" key={endpoint}>
              <div className="card-header">
                <span className="title">{endpoint}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>테스트 예시</h2>
        <div className="card">
          <p className="body"><code>{verifyIdentityCurl}</code></p>
        </div>
      </section>

      <footer className="footer">
        <span>VOKO MVP FIREBASE BASELINE</span>
        <div className="pill-row">
          <span className="pill">identity_verified</span>
          <span className="pill">hashed_ci</span>
          <span className="pill">report_count threshold</span>
        </div>
      </footer>
    </div>
  );
}
