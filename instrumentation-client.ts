// Launch-week error log: a page of /teacher or /app that throws sends a small report to our own route, which prints it to
// Vercel's runtime logs. No third party. Only the message, the top of the stack, the path (no query, no hash), the app and the user agent.
const ENDPOINT = "/app/api/client-error";
const MAX_REPORTS = 10;
const seen = new Set<string>();

function report(message: unknown, stack: unknown) {
  try {
    const path = location.pathname;
    const app = path === "/teacher" || path.startsWith("/teacher/") ? "teacher" : path === "/app" || path.startsWith("/app/") ? "app" : null;
    if (!app || seen.size >= MAX_REPORTS) return;
    const body = JSON.stringify({
      message: String(message ?? "").slice(0, 500),
      stack: typeof stack === "string" ? stack.split("\n").slice(0, 8).join("\n").slice(0, 2000) : "",
      path,
      app,
      userAgent: navigator.userAgent.slice(0, 300),
    });
    if (seen.has(body)) return;
    seen.add(body);
    // A Blob of type application/json keeps the beacon a CORS-safe, same-origin JSON request.
    const sent = navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }));
    if (!sent) void fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    // Reporting must never throw.
  }
}

window.addEventListener("error", (e) => report(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  report(r instanceof Error ? r.message : r, r instanceof Error ? r.stack : "");
});
