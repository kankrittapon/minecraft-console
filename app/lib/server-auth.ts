import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? process.env.NEXT_PUBLIC_ALLOWED_EMAIL ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export interface AuthorizedUser {
  id: string;
  email: string;
}

export const authorizeRequest = async (request: Request): Promise<AuthorizedUser | NextResponse> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase env is not configured" }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.toLowerCase() ?? "";

  if (error || !data.user || !email) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email)) {
    return NextResponse.json({ error: "Email is not allowed" }, { status: 403 });
  }

  return { id: data.user.id, email };
};
