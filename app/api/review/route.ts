import { NextResponse } from "next/server";
import { checkReviewAuth } from "@/lib/auth";
import { listPending } from "@/lib/store";

export async function GET(req: Request) {
  if (!checkReviewAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pending = await listPending();
  return NextResponse.json({ submissions: pending });
}
