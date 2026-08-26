// Minimal auth for the review dashboard: a single shared password set via
// the REVIEW_PASSWORD env var, sent by the client as an "x-review-password"
// header. This is intentionally simple — good enough for a small class tool
// used only by you, not a general-purpose auth system. Use a real password
// (not "password123") and don't share it with students.

export function checkReviewAuth(req: Request): boolean {
  const expected = process.env.REVIEW_PASSWORD;
  if (!expected) {
    // If you haven't set a password, refuse everything rather than leaving
    // the review queue open to anyone who finds the URL.
    return false;
  }
  const provided = req.headers.get("x-review-password");
  return provided === expected;
}
