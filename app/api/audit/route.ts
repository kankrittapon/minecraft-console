import { NextResponse } from "next/server";
import { authorizeRequest } from "@/app/lib/server-auth";
import { readAudit } from "@/app/lib/minecraft";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ logs: await readAudit() });
}
