import { NextResponse } from "next/server";
import { authorizeRequest } from "@/app/lib/server-auth";
import { appendAudit, sendRconCommand } from "@/app/lib/minecraft";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { command?: string } | null;
  const command = body?.command?.trim() ?? "";
  if (!command) return NextResponse.json({ error: "Command is required" }, { status: 400 });

  try {
    const result = await sendRconCommand(id, command);
    await appendAudit({ user: auth.email, serverId: id, action: "command", command, ok: true });
    return NextResponse.json(result);
  } catch (error) {
    await appendAudit({ user: auth.email, serverId: id, action: "command", command, ok: false, error: String(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Command failed" }, { status: 500 });
  }
}
