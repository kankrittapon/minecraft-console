import { NextResponse } from "next/server";
import { authorizeRequest } from "@/app/lib/server-auth";
import { appendAudit, readServerProperties, writeServerProperties } from "@/app/lib/minecraft";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  try {
    return NextResponse.json(await readServerProperties(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read properties" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { values?: Record<string, string>; restart?: boolean } | null;
  try {
    const backupPath = await writeServerProperties(id, body?.values ?? {});
    await appendAudit({ user: auth.email, serverId: id, action: "save-properties", keys: Object.keys(body?.values ?? {}), backupPath, ok: true });
    return NextResponse.json({ ok: true, backupPath });
  } catch (error) {
    await appendAudit({ user: auth.email, serverId: id, action: "save-properties", ok: false, error: String(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save properties" }, { status: 500 });
  }
}
