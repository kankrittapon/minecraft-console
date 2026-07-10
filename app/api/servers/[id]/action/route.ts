import { NextResponse } from "next/server";
import { authorizeRequest } from "@/app/lib/server-auth";
import { controlServer } from "@/app/lib/minecraft";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;

  if (action !== "start" && action !== "stop" && action !== "restart") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  try {
    const containerName = await controlServer(id, action);
    return NextResponse.json({ ok: true, containerName, action });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed" }, { status: 500 });
  }
}
