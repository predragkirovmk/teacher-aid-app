const MAX_BODY = 4096;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

/** Launch-week client error log (see instrumentation-client.ts). Prints one line to the runtime logs; stores nothing. */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY) return new Response(null, { status: 413 });
  // The header can lie or be missing, so count what actually arrives.
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return new Response(null, { status: 413 });

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return new Response(null, { status: 400 });
  const d = data as Record<string, unknown>;

  const message = str(d.message, 500);
  const stack = str(d.stack, 2000);
  const path = str(d.path, 300);
  const userAgent = str(d.userAgent, 300);
  if (message === null || stack === null || path === null || userAgent === null || (d.app !== "teacher" && d.app !== "app")) {
    return new Response(null, { status: 400 });
  }

  console.error("[client-error]", JSON.stringify({ message, stack, path, app: d.app, userAgent }));
  return new Response(null, { status: 204 });
}
