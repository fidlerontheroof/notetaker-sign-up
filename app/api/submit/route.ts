import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveSubmission } from "@/lib/store";
import type { Submission } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json();
  const { studentName, classDate, topic, notesText } = body || {};

  if (!studentName || !classDate || !topic || !notesText) {
    return NextResponse.json(
      { error: "studentName, classDate, topic, and notesText are required." },
      { status: 400 }
    );
  }

  const submission: Submission = {
    id: randomUUID(),
    studentName,
    classDate,
    topic,
    notesText,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await saveSubmission(submission);

  return NextResponse.json({
    ok: true,
    id: submission.id,
    message:
      "Thanks — your notes were submitted and will be posted to the class notes page once reviewed.",
  });
}
