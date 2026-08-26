export type SubmissionStatus =
  | "pending" // waiting for instructor review
  | "posted" // live in the Google Doc
  | "rejected"; // reviewed and declined

export interface Submission {
  id: string;
  studentName: string; // kept for accountability, never posted to the doc
  classDate: string; // e.g. "2026-07-27"
  topic: string;
  notesText: string;
  status: SubmissionStatus;
  createdAt: string;
  reviewedAt?: string;
  postedText?: string; // final text actually posted, if edited during review
  postedUrl?: string; // link to the doc/page where this was posted
}
