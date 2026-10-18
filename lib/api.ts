import { NextResponse } from "next/server";

export const HOST_KEY = process.env.HOST_KEY || "bitola";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readBody<T extends Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function hostAuthorized(key: unknown): boolean {
  return typeof key === "string" && key === HOST_KEY;
}
