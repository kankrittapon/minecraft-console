import { NextResponse } from "next/server";
import { authorizeRequest } from "@/app/lib/server-auth";
import { listServers } from "@/app/lib/minecraft";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const servers = await listServers();
    return NextResponse.json({ servers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to list Minecraft servers" }, { status: 500 });
  }
}
