"use client";

import { useState } from "react";

type ReportItem = {
  id: string;
  reason_code: string;
  reason_text?: string;
  target_type: string;
  target_id: string;
  reporter_uid: string;
  status: string;
};

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [targetUid, setTargetUid] = useState("");
  const [actionType, setActionType] = useState("warn");

  async function loadReports() {
    const res = await fetch("/api/admin/reports?status=open&limit=30", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as { reports?: ReportItem[]; error?: string };
    if (!res.ok) {
      setStatusMessage(`보고서 조회 실패: ${body.error ?? "unknown_error"}`);
      return;
    }
    setReports(body.reports ?? []);
    setStatusMessage(`open 신고 ${body.reports?.length ?? 0}건 로드 완료`);
  }

  async function resolveReport(reportId: string, status: "resolved" | "rejected") {
    const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status,
        resolution: status === "resolved" ? "관리자 처리 완료" : "신고 반려",
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setStatusMessage(`처리 실패: ${body.error ?? "unknown_error"}`);
      return;
    }
    setStatusMessage(`신고 ${reportId} ${status} 처리 완료`);
    await loadReports();
  }

  async function createModerationAction() {
    const res = await fetch("/api/admin/moderation-actions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_uid: targetUid,
        action_type: actionType,
        duration_hours: actionType === "warn" ? 0 : 24,
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setStatusMessage(`제재 실패: ${body.error ?? "unknown_error"}`);
      return;
    }
    setStatusMessage(`제재 등록 완료: ${targetUid} / ${actionType}`);
  }

  return (
    <div className="page">
      <section className="section">
        <h2>Admin Console</h2>
        <p className="meta">
          Firebase ID Token(관리자 custom claim: admin=true)으로 인증합니다.
        </p>
        <div className="card">
          <label className="meta" htmlFor="admin-token">Admin Token</label>
          <input
            id="admin-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="input"
            placeholder="Bearer 없이 ID token만 입력"
          />
          <div className="button-row">
            <button className="button" onClick={loadReports}>Open 신고 불러오기</button>
          </div>
          <p className="meta">{statusMessage}</p>
        </div>
      </section>

      <section className="section">
        <h2>신고 처리</h2>
        <div className="grid-2">
          {reports.map((report) => (
            <article className="post" key={report.id}>
              <div className="card-header">
                <span className="title">{report.reason_code}</span>
                <span className="meta">{report.status}</span>
              </div>
              <p className="body">{report.reason_text || "사유 상세 없음"}</p>
              <p className="meta">
                {report.target_type}:{report.target_id} / reporter:{report.reporter_uid}
              </p>
              <div className="button-row">
                <button className="button" onClick={() => resolveReport(report.id, "resolved")}>
                  승인 처리
                </button>
                <button
                  className="button secondary"
                  onClick={() => resolveReport(report.id, "rejected")}
                >
                  반려 처리
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>사용자 제재</h2>
        <div className="card">
          <input
            value={targetUid}
            onChange={(e) => setTargetUid(e.target.value)}
            className="input"
            placeholder="target uid"
          />
          <select
            className="input"
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
          >
            <option value="warn">warn</option>
            <option value="mute">mute</option>
            <option value="suspend">suspend</option>
            <option value="ban">ban</option>
            <option value="content_hide">content_hide</option>
          </select>
          <div className="button-row">
            <button className="button" onClick={createModerationAction}>제재 등록</button>
          </div>
        </div>
      </section>
    </div>
  );
}
