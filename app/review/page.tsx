"use client";

import { useState } from "react";
import type { Submission } from "@/lib/types";

export default function ReviewPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});

  async function loadQueue(pw: string) {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/review", {
        headers: { "x-review-password": pw },
      });
      if (res.status === 401) {
        setAuthed(false);
        setLoadError("Incorrect password.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load review queue.");
      const data = await res.json();
      setSubmissions(data.submissions);
      setAuthed(true);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    loadQueue(password);
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-review-password": password,
        },
        body: JSON.stringify({
          id,
          action,
          editedText: edits[id],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Action failed.");
      }
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setActionError((prev) => ({ ...prev, [id]: err.message || "Failed." }));
    }
  }

  if (!authed) {
    return (
      <div className="page">
        <div className="login-box">
          <h1>Review Queue</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Review password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Checking..." : "Enter"}
            </button>
          </form>
          {loadError && <div className="notice error">{loadError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="masthead">
        <p className="eyebrow">Instructor Only</p>
        <h1>Notes Awaiting Review</h1>
        <p>
          Every submission lands here first. Edit if needed, then approve to
          post it to the class Google Doc, or reject it.
        </p>
      </div>

      {submissions.length === 0 && (
        <div className="empty-state">Nothing waiting for review right now.</div>
      )}

      {submissions.map((s) => (
        <div className="queue-item" key={s.id}>
          <div className="meta">
            {s.studentName} · {s.classDate}
            {s.topic ? ` · ${s.topic}` : ""}
          </div>
          <textarea
            defaultValue={s.notesText}
            onChange={(e) =>
              setEdits((prev) => ({ ...prev, [s.id]: e.target.value }))
            }
          />
          <div className="queue-actions">
            <button
              className="btn-approve"
              onClick={() => handleAction(s.id, "approve")}
            >
              Approve &amp; Post
            </button>
            <button
              className="btn-reject"
              onClick={() => handleAction(s.id, "reject")}
            >
              Reject
            </button>
          </div>
          {actionError[s.id] && (
            <div className="notice error">{actionError[s.id]}</div>
          )}
        </div>
      ))}
    </div>
  );
}
