"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "verifying" | "done" | "unconfirmed" | "error";

export default function SubmitPage() {
  const [studentName, setStudentName] = useState("");
  const [classDate, setClassDate] = useState("");
  const [topic, setTopic] = useState("");
  const [notesText, setNotesText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function resetForm() {
    setStudentName("");
    setClassDate("");
    setTopic("");
    setNotesText("");
  }

  async function verifySubmission(id: string) {
    try {
      const res = await fetch(`/api/verify?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setStatus("unconfirmed");
        return;
      }
      const data = await res.json();
      setStatus(data.exists ? "done" : "unconfirmed");
    } catch {
      // If the verification check itself can't be reached, we genuinely
      // don't know whether the submission landed — treat it the same as
      // "unconfirmed" so the student knows to double check, rather than
      // falsely reassuring them.
      setStatus("unconfirmed");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName, classDate, topic, notesText }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      const data = await res.json();
      resetForm();
      setStatus("verifying");

      // Small delay before checking, so we're not racing the same request
      // that just wrote the record.
      setTimeout(() => {
        verifySubmission(data.id);
      }, 1200);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Submission failed. Please try again.");
    }
  }

  return (
    <div className="page">
      <div className="masthead">
        <p className="eyebrow">Criminal Procedure</p>
        <h1>Submit Class Notes</h1>
        <p>
          Notes are reviewed before posting and will appear on the class notes
          page in Google Drive, organized by class date.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <label htmlFor="studentName">Your name</label>
        <input
          id="studentName"
          type="text"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          required
        />

        <label htmlFor="classDate">Class date</label>
        <input
          id="classDate"
          type="date"
          value={classDate}
          onChange={(e) => setClassDate(e.target.value)}
          required
        />

        <label htmlFor="topic">Topic</label>
        <input
          id="topic"
          type="text"
          placeholder="e.g. Carpenter and the mosaic theory"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          required
        />

        <label htmlFor="notesText">Notes</label>
        <textarea
          id="notesText"
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
          placeholder="Paste or type your notes here..."
          required
        />

        <button
          type="submit"
          className="btn-primary"
          disabled={status === "submitting" || status === "verifying"}
        >
          {status === "submitting"
            ? "Submitting..."
            : status === "verifying"
            ? "Confirming..."
            : "Submit Notes"}
        </button>
      </form>

      {status === "done" && (
        <div className="notice">
          Thanks — your notes were submitted and will appear on the class
          notes page shortly.
        </div>
      )}

      {status === "unconfirmed" && (
        <div className="notice warning">
          Your notes appeared to submit, but we couldn't confirm they
          actually reached our server — this can happen on some school wifi
          networks. Please try again on a different network (like your
          phone's cellular data) to be safe, and let your instructor know if
          this keeps happening.
        </div>
      )}

      {status === "error" && <div className="notice error">{errorMsg}</div>}
    </div>
  );
}
