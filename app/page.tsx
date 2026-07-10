"use client";

import { createClient, type User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? process.env.NEXT_PUBLIC_ALLOWED_EMAIL ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

interface MinecraftServer {
  id: string;
  folderPath: string;
  dataPath: string | null;
  worldPath: string | null;
  propertiesPath: string | null;
  composePath: string | null;
  containerName: string | null;
  image: string | null;
  state: string;
  status: string;
  health: string | null;
  ports: string;
  createdAt: string | null;
}

const statusColor = (server: MinecraftServer) => {
  if (server.state === "running" && server.health === "healthy") return "bg-emerald-400";
  if (server.state === "running") return "bg-yellow-300";
  if (server.state === "exited") return "bg-zinc-400";
  return "bg-red-400";
};

export default function MinecraftConsole() {
  const supabase = useMemo(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }, []);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [servers, setServers] = useState<MinecraftServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyServer, setBusyServer] = useState("");
  const [notice, setNotice] = useState("พร้อมสแกน Minecraft servers ผ่าน Tailscale");

  const signedInEmail = authUser?.email?.toLowerCase() ?? "";
  const isAllowedUser = Boolean(authUser) && (ALLOWED_EMAILS.length === 0 || ALLOWED_EMAILS.includes(signedInEmail));

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuthUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const getAccessToken = useCallback(async () => {
    if (!supabase) return "";
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, [supabase]);

  const loadServers = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;

    setLoading(true);
    const response = await fetch("/api/servers", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json()) as { servers?: MinecraftServer[]; error?: string };
    setLoading(false);

    if (!response.ok) {
      setNotice(data.error ?? "โหลด server ไม่สำเร็จ");
      return;
    }

    setServers(data.servers ?? []);
    setNotice(`พบ ${(data.servers ?? []).length} server ใต้ minecraft-server`);
  }, [getAccessToken]);

  useEffect(() => {
    if (!isAllowedUser) return;

    const timeoutId = window.setTimeout(() => {
      void loadServers();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAllowedUser, loadServers]);

  const sendMagicLink = async () => {
    if (!supabase || !authEmail.trim()) return;

    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: SITE_URL || window.location.origin },
    });
    setAuthBusy(false);
    setAuthMessage(error ? error.message : "ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว");
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setServers([]);
    setAuthMessage("ออกจากระบบแล้ว");
  };

  const runAction = async (server: MinecraftServer, action: "start" | "stop" | "restart") => {
    const token = await getAccessToken();
    if (!token) return;

    setBusyServer(`${server.id}:${action}`);
    setNotice(`กำลัง ${action} ${server.id}...`);
    const response = await fetch(`/api/servers/${server.id}/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    const data = (await response.json()) as { error?: string };
    setBusyServer("");

    if (!response.ok) {
      setNotice(data.error ?? `${action} ไม่สำเร็จ`);
      return;
    }

    setNotice(`${action} ${server.id} สำเร็จ`);
    window.setTimeout(() => {
      void loadServers();
    }, 900);
  };

  if (!supabase) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07110d] px-4 text-stone-100">
        <section className="w-full max-w-2xl border border-emerald-400/20 bg-black/40 p-6 shadow-2xl">
          <p className="text-xs font-bold uppercase text-emerald-300">Setup required</p>
          <h1 className="mt-3 text-3xl font-black">ตั้งค่า Supabase env ก่อนใช้งาน</h1>
          <pre className="mt-5 overflow-x-auto bg-black/50 p-4 text-xs leading-6 text-emerald-200">
{`NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_EMAILS=your@email.com
NEXT_PUBLIC_SITE_URL=http://100.68.88.63:3100`}
          </pre>
        </section>
      </main>
    );
  }

  if (authLoading) {
    return <main className="grid min-h-screen place-items-center bg-[#07110d] text-emerald-200">กำลังตรวจสอบ session...</main>;
  }

  if (!authUser) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07110d] px-4 text-stone-100">
        <section className="w-full max-w-md border border-emerald-400/20 bg-black/45 p-6 shadow-2xl">
          <p className="text-xs font-bold uppercase text-emerald-300">Tailscale Console</p>
          <h1 className="mt-3 text-3xl font-black">Minecraft Console</h1>
          <p className="mt-3 text-sm leading-6 text-stone-300">เข้าสู่ระบบด้วยอีเมลที่อยู่ใน allowlist เท่านั้น</p>
          <div className="mt-6 space-y-3">
            <input
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && sendMagicLink()}
              placeholder="email"
              className="w-full border border-emerald-400/25 bg-black/60 px-4 py-3 text-sm outline-none focus:border-emerald-300"
            />
            <button
              onClick={sendMagicLink}
              disabled={authBusy}
              className="w-full bg-emerald-300 px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authBusy ? "กำลังส่งลิงก์..." : "ส่งลิงก์เข้าสู่ระบบ"}
            </button>
          </div>
          {authMessage && <p className="mt-4 text-sm text-stone-300">{authMessage}</p>}
        </section>
      </main>
    );
  }

  if (!isAllowedUser) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07110d] px-4 text-stone-100">
        <section className="w-full max-w-md border border-red-400/30 bg-black/45 p-6 shadow-2xl">
          <p className="text-xs font-bold uppercase text-red-300">Access blocked</p>
          <h1 className="mt-3 text-2xl font-black">อีเมลนี้ยังไม่ได้รับอนุญาต</h1>
          <p className="mt-3 text-sm text-stone-300">{authUser.email}</p>
          <button onClick={signOut} className="mt-5 border border-emerald-400/30 px-5 py-2 text-sm font-bold text-emerald-200">
            ออกจากระบบ
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07110d] text-stone-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-emerald-300/15 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Private Tailscale Server Console</p>
            <h1 className="mt-2 text-4xl font-black">Minecraft Console</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
              สแกน server ใต้ `/home/kanfullbuster/minecraft-server` และควบคุมเฉพาะ container ชื่อ `mc-*`
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-emerald-300/20 bg-black/35 px-3 py-2 text-xs text-stone-300">{authUser.email}</span>
            <button onClick={signOut} className="border border-emerald-300/25 px-4 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-300/10">
              Logout
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-emerald-300/15 bg-black/35 p-4">
          <p className="text-sm text-stone-300">{notice}</p>
          <button
            onClick={() => void loadServers()}
            disabled={loading}
            className="bg-emerald-300 px-4 py-2 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "กำลังสแกน..." : "Refresh"}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {servers.map((server) => (
            <article key={server.id} className="border border-emerald-300/15 bg-black/35 p-5 shadow-xl shadow-black/30">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusColor(server)}`} />
                    <h2 className="truncate text-2xl font-black">{server.id}</h2>
                  </div>
                  <p className="mt-1 text-sm text-stone-400">{server.containerName ?? "ยังไม่พบ container"}</p>
                </div>
                <span className="border border-emerald-300/15 px-3 py-1 text-xs text-emerald-200">{server.state}</span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-stone-500">Status</dt>
                  <dd className="mt-1 text-stone-200">{server.status}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Health</dt>
                  <dd className="mt-1 text-stone-200">{server.health ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Ports</dt>
                  <dd className="mt-1 break-all text-stone-200">{server.ports || "-"}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Image</dt>
                  <dd className="mt-1 break-all text-stone-200">{server.image ?? "-"}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-stone-500">World</dt>
                  <dd className="mt-1 break-all text-stone-200">{server.worldPath ?? "ยังไม่พบ world folder"}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {(["start", "stop", "restart"] as const).map((action) => (
                  <button
                    key={action}
                    onClick={() => void runAction(server, action)}
                    disabled={!server.containerName || Boolean(busyServer)}
                    className="border border-emerald-300/25 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyServer === `${server.id}:${action}` ? "กำลังทำงาน..." : action}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>

        {servers.length === 0 && !loading && (
          <div className="border border-emerald-300/15 bg-black/35 p-8 text-center text-stone-400">
            ยังไม่พบ Minecraft server folder
          </div>
        )}
      </section>
    </main>
  );
}
