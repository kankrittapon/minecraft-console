import { NextResponse } from "next/server";
import { authorizeRequest } from "@/app/lib/server-auth";
import { appendAudit, readPresets, savePresets, type CommandPreset } from "@/app/lib/minecraft";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ presets: await readPresets() });
}

export async function PUT(request: Request) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { presets?: CommandPreset[] } | null;
  try {
    const presets = await savePresets(body?.presets ?? []);
    await appendAudit({ user: auth.email, action: "save-presets", count: presets.length, ok: true });
    return NextResponse.json({ presets });
  } catch (error) {
    await appendAudit({ user: auth.email, action: "save-presets", ok: false, error: String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save presets failed" },
      { status: 400 },
    );
  }
}
