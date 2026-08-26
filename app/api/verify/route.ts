import { NextResponse } from "next/server";
import { getSubmission } from "@/lib/store";

// Lets the student-facing form confirm a submission actually landed in
// storage, rather than trusting the POST /api/submit response alone. This
// exists because some school network filters intercept requests to
// unfamiliar domains and return a fake success response without ever
// letting the real request through — in that case, the "Thanks, submitted"
// message would be a lie. This endpoint gives the client a second,
// independent check: did this exact id actually get saved?
//
// Deliberately returns only a boolean, never the submission content — no
// student or instructor data is exposed here, and no auth is required
// since there's nothing sensitive to protect.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const submission = await getSubmission(id);
  return NextResponse.json({ exists: Boolean(submission) });
}
