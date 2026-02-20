export default function Home() {
  const collections = [
    "users",
    "boards",
    "posts",
    "comments",
    "reports",
    "moderation_actions",
  ];

  const deployNotes = [
    "Cloudflare Pages Static Export",
    "Build output: out/",
    "API는 별도 Firebase Functions 백엔드에서 운영",
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
            <span className="ticker">v0.1 ◉ STATIC READY</span>
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
        <h2>Deploy Notes</h2>
        <div className="grid-2">
          {deployNotes.map((note) => (
            <article className="post" key={note}>
              <div className="card-header">
                <span className="title">{note}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>운영 메모</h2>
        <div className="card">
          <p className="body">
            Cloudflare Pages는 정적 프론트만 배포합니다. 인증/신고/관리자 API는
            `firebase-functions`를 별도 배포해 연결하세요.
          </p>
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
