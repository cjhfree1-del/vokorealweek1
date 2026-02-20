import { channels, jobs, posts } from "@/lib/mock-data";

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <div className="brand">
            <div className="logo">VOKO</div>
            <div>
              <p className="meta">Korean Artist Community</p>
              <h1>익명과 소셜이 공존하는 아티스트 베이스캠프.</h1>
            </div>
          </div>
          <p>
            사운드, 비주얼, 퍼포먼스, 영상까지. 창작자들이 익명으로 고민을 나누고,
            프로젝트를 연결하고, 채용 기회를 발견하는 레트로 감성 커뮤니티.
          </p>
          <div className="pill-row">
            <span className="pill">익명 게시판</span>
            <span className="pill">분야별 채널</span>
            <span className="pill">구인구직</span>
            <span className="pill">포트폴리오 링크</span>
            <span className="pill">실시간 피드</span>
          </div>
          <div className="button-row">
            <button className="button">익명으로 시작하기</button>
            <button className="button secondary">소셜 로그인</button>
          </div>
        </div>
        <div className="hero-card">
          <h3>오늘의 커뮤니티 펄스</h3>
          <p>방금 올라온 익명 글 214개 • 프로젝트 매칭 18건</p>
          <div className="pill-row">
            <span className="ticker">LIVE ◉ CREW CALL</span>
            <span className="ticker">NEW ◉ SHOWCASE</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>분야별 채널</h2>
        <div className="grid-3">
          {channels.map((channel) => (
            <div className="card" key={channel.slug}>
              <div className="card-header">
                <strong>{channel.name}</strong>
                <span className="meta">{channel.members} members</span>
              </div>
              <p>{channel.vibe}</p>
              <div className="tag-row">
                {channel.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>익명 게시판</h2>
        <div className="grid-2">
          {posts.map((post) => (
            <article className="post" key={post.id}>
              <div className="card-header">
                <span className="title">{post.title}</span>
                <span className="meta">{post.channel}</span>
              </div>
              <p className="body">{post.body}</p>
              <div className="tag-row">
                {post.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="post-footer">
                <span className="meta">
                  {post.author} • {post.time}
                </span>
                <span>
                  👍 {post.reactions} • 💬 {post.comments}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>구인구직 보드</h2>
        <div className="grid-3">
          {jobs.map((job) => (
            <div className="job" key={job.id}>
              <div className="card-header">
                <strong>{job.title}</strong>
                <span className="badge">{job.type}</span>
              </div>
              <p className="meta">
                {job.studio} · {job.location}
              </p>
              <p>
                <strong>{job.pay}</strong>
              </p>
              <div className="tag-row">
                {job.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <span className="meta">{job.closing}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>VOKO SIGNAL 1998</span>
        <div className="pill-row">
          <span className="pill">커뮤니티 규칙</span>
          <span className="pill">운영 정책</span>
          <span className="pill">문의하기</span>
        </div>
      </footer>
    </div>
  );
}
