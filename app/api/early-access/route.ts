import { allowRequest, normalizeEmail, normalizeSrc, saveSignup } from "@/lib/early-access";

export const dynamic = "force-dynamic";

const reply = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  let body: { email?: unknown; src?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }

  // Honeypot: people never see the field, so anything in it is a bot. Pretend it worked.
  if (typeof body.website === "string" && body.website.trim() !== "") return reply({ ok: true });

  const email = normalizeEmail(body.email);
  if (!email) return reply({ error: "invalid_email" }, 400);

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    if (!(await allowRequest(ip))) return reply({ error: "rate_limited" }, 429);
    await saveSignup(email, normalizeSrc(body.src));
  } catch (error) {
    console.error("[early-access] save failed", error);
    return reply({ error: "server_error" }, 500);
  }

  return reply({ ok: true });
}
