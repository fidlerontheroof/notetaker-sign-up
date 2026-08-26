import { NextResponse } from "next/server";
import { checkReviewAuth } from "@/lib/auth";
import { getSubmission, saveSubmission, deleteSubmission } from "@/lib/store";
import { postNoteToGoogleDrive } from "@/lib/google-drive";

export async function POST(req: Request) {
  if (!checkReviewAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action, editedText } = await req.json();
  if (!id || !action) {
    return NextResponse.json(
      { error: "id and action are required." },
      { status: 400 }
    );
  }

  const submission = await getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "reject") {
    submission.status = "rejected";
    submission.reviewedAt = new Date().toISOString();
    await saveSubmission(submission);
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    const finalText = (editedText && editedText.trim()) || submission.notesText;
    try {
      const postedUrl = await postNoteToGoogleDrive({
        classDate: submission.classDate,
        topic: submission.topic,
        notesText: finalText,
      });
      await deleteSubmission(id);
      return NextResponse.json({ ok: true, postedUrl });
    } catch (err) {
      console.error("Google Drive post failed on approval:", err);
      return NextResponse.json(
        { error: "Approved but posting to Google Drive failed. Check Google API config and retry." },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
