import { NextResponse } from "next/server";
import { authorizeRequest } from "@/app/lib/server-auth";
import { appendAudit, reworldServer } from "@/app/lib/minecraft";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== id) return NextResponse.json({ error: "Confirmation must match server id" }, { status: 400 });

  try {
    const backupPath = await reworldServer(id);
    await appendAudit({ user: auth.email, serverId: id, action: "reworld", backupPath, ok: true });
    return NextResponse.json({ ok: true, backupPath });
  } catch (error) {
    await appendAudit({ user: auth.email, serverId: id, action: "reworld", ok: false, error: String(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Re-world failed" }, { status: 500 });
  }
}
