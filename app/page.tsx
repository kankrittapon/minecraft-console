"use client";

import { createClient, type User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
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

interface CommandPreset {
  id: string;
  label: string;
  command: string;
}

interface ServerProperties {
  values: Record<string, string>;
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
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [servers, setServers] = useState<MinecraftServer[]>([]);
  const [presets, setPresets] = useState<CommandPreset[]>([]);
  const [auditLogs, setAuditLogs] = useState<string[]>([]);
  const [commandInputs, setCommandInputs] = useState<Record<string, string>>({});
  const [commandOutput, setCommandOutput] = useState<Record<string, string>>({});
  const [propertiesByServer, setPropertiesByServer] = useState<Record<string, Record<string, string>>>({});
  const [reworldConfirm, setReworldConfirm] = useState<Record<string, string>>({});
  const [newPreset, setNewPreset] = useState({ label: "", command: "" });
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

  const authedFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Missing session");
      return fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
    },
    [getAccessToken],
  );

  const loadPresets = useCallback(async () => {
    const response = await authedFetch("/api/presets");
    const data = (await response.json()) as { presets?: CommandPreset[] };
    if (response.ok) setPresets(data.presets ?? []);
  }, [authedFetch]);

  const loadAudit = useCallback(async () => {
    const response = await authedFetch("/api/audit");
    const data = (await response.json()) as { logs?: string[] };
    if (response.ok) setAuditLogs(data.logs ?? []);
  }, [authedFetch]);

  useEffect(() => {
    if (!isAllowedUser) return;

    const timeoutId = window.setTimeout(() => {
      void loadServers();
      void loadPresets();
      void loadAudit();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAllowedUser, loadAudit, loadPresets, loadServers]);

  const sendMagicLink = async () => {
    if (!supabase || !authEmail.trim()) return;

    setAuthBusy(true);
    setAuthMessage("");
    const redirectTo = window.location.origin.replace(/\/$/, "");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setAuthBusy(false);
    setAuthMessage(
      error
        ? error.message.toLowerCase().includes("rate limit")
          ? "ส่งลิงก์ถี่เกินไปจาก Supabase Auth กรุณาใช้รหัสผ่านชั่วคราว หรือรอให้ rate limit รีเซ็ต"
          : error.message
        : "ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว",
    );
  };

  const signInWithPassword = async () => {
    if (!supabase || !authEmail.trim() || !authPassword) return;

    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    setAuthBusy(false);
    setAuthMessage(error ? error.message : "เข้าสู่ระบบแล้ว");
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
      void loadAudit();
    }, 900);
  };

  const sendCommand = async (server: MinecraftServer, command: string) => {
    if (!command.trim()) return;
    setBusyServer(`${server.id}:command`);
    setNotice(`กำลังส่งคำสั่งไปที่ ${server.id}...`);
    const response = await authedFetch(`/api/servers/${server.id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: command.trim() }),
    });
    const data = (await response.json()) as { output?: string; error?: string };
    setBusyServer("");
    setCommandOutput((previous) => ({ ...previous, [server.id]: data.output ?? data.error ?? "" }));
    setNotice(response.ok ? `ส่งคำสั่ง ${server.id} สำเร็จ` : data.error ?? "ส่งคำสั่งไม่สำเร็จ");
    void loadAudit();
  };

  const savePresets = async (nextPresets: CommandPreset[]) => {
    const response = await authedFetch("/api/presets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presets: nextPresets }),
    });
    const data = (await response.json()) as { presets?: CommandPreset[]; error?: string };
    if (response.ok) {
      setPresets(data.presets ?? []);
      setNewPreset({ label: "", command: "" });
      setNotice("บันทึก presets แล้ว");
    } else {
      setNotice(data.error ?? "บันทึก presets ไม่สำเร็จ");
    }
  };

  const loadProperties = async (server: MinecraftServer) => {
    setBusyServer(`${server.id}:properties`);
    const response = await authedFetch(`/api/servers/${server.id}/properties`);
    const data = (await response.json()) as ServerProperties & { error?: string };
    setBusyServer("");
    if (!response.ok) {
      setNotice(data.error ?? "อ่าน server.properties ไม่สำเร็จ");
      return;
    }
    setPropertiesByServer((previous) => ({ ...previous, [server.id]: data.values ?? {} }));
  };

  const saveProperties = async (server: MinecraftServer, restart = false) => {
    const values = propertiesByServer[server.id];
    if (!values) return;
    setBusyServer(`${server.id}:save-properties`);
    const response = await authedFetch(`/api/servers/${server.id}/properties`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    const data = (await response.json()) as { backupPath?: string; error?: string };
    setBusyServer("");
    if (!response.ok) {
      setNotice(data.error ?? "บันทึก server.properties ไม่สำเร็จ");
      return;
    }
    setNotice(`บันทึก properties แล้ว backup: ${data.backupPath ?? "-"}`);
    if (restart) await runAction(server, "restart");
    void loadAudit();
  };

  const runReworld = async (server: MinecraftServer) => {
    setBusyServer(`${server.id}:reworld`);
    const response = await authedFetch(`/api/servers/${server.id}/reworld`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: reworldConfirm[server.id] ?? "" }),
    });
    const data = (await response.json()) as { backupPath?: string; error?: string };
    setBusyServer("");
    setNotice(response.ok ? `Re-world สำเร็จ backup: ${data.backupPath}` : data.error ?? "Re-world ไม่สำเร็จ");
    void loadServers();
    void loadAudit();
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
NEXT_PUBLIC_SITE_URL=http://<TAILSCALE_IP>:3100`}
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
              onKeyDown={(event) => event.key === "Enter" && (authPassword ? signInWithPassword() : sendMagicLink())}
              placeholder="email"
              className="w-full border border-emerald-400/25 bg-black/60 px-4 py-3 text-sm outline-none focus:border-emerald-300"
            />
            <input
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && signInWithPassword()}
              placeholder="password (optional)"
              className="w-full border border-emerald-400/25 bg-black/60 px-4 py-3 text-sm outline-none focus:border-emerald-300"
            />
            <button
              onClick={signInWithPassword}
              disabled={authBusy || !authPassword}
              className="w-full border border-emerald-300/30 px-5 py-3 text-sm font-black text-emerald-200 transition hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authBusy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วยรหัสผ่าน"}
            </button>
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
              สแกน server ใต้ host Minecraft root ที่ mount เข้า container และควบคุมเฉพาะ container ชื่อ `mc-*`
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

              <div className="mt-6 border-t border-emerald-300/10 pt-5">
                <h3 className="text-sm font-black text-emerald-200">Admin Commands</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => void sendCommand(server, preset.command)}
                      disabled={!server.containerName || Boolean(busyServer)}
                      className="border border-emerald-300/20 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-50"
                      title={preset.command}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={commandInputs[server.id] ?? ""}
                    onChange={(event) => setCommandInputs((previous) => ({ ...previous, [server.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void sendCommand(server, commandInputs[server.id] ?? "");
                    }}
                    placeholder="เช่น say Hello, list, save-all"
                    className="min-w-0 flex-1 border border-emerald-300/20 bg-black/40 px-3 py-2 text-sm outline-none focus:border-emerald-300"
                  />
                  <button
                    onClick={() => void sendCommand(server, commandInputs[server.id] ?? "")}
                    disabled={!server.containerName || Boolean(busyServer)}
                    className="bg-emerald-300 px-4 py-2 text-sm font-black text-black disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
                {commandOutput[server.id] && (
                  <pre className="mt-3 max-h-32 overflow-auto border border-emerald-300/10 bg-black/45 p-3 text-xs text-stone-300">
                    {commandOutput[server.id]}
                  </pre>
                )}
              </div>

              <div className="mt-6 border-t border-emerald-300/10 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-emerald-200">server.properties</h3>
                  <button
                    onClick={() => void loadProperties(server)}
                    className="border border-emerald-300/25 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-300/10"
                  >
                    Load
                  </button>
                </div>
                {propertiesByServer[server.id] && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {["motd", "max-players", "difficulty", "gamemode", "pvp", "white-list", "view-distance", "simulation-distance"].map((key) => (
                      <label key={key} className="text-xs text-stone-400">
                        {key}
                        <input
                          value={propertiesByServer[server.id]?.[key] ?? ""}
                          onChange={(event) =>
                            setPropertiesByServer((previous) => ({
                              ...previous,
                              [server.id]: { ...(previous[server.id] ?? {}), [key]: event.target.value },
                            }))
                          }
                          className="mt-1 w-full border border-emerald-300/20 bg-black/40 px-3 py-2 text-sm text-stone-100 outline-none focus:border-emerald-300"
                        />
                      </label>
                    ))}
                    <div className="sm:col-span-2 mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => void saveProperties(server, false)}
                        className="border border-emerald-300/25 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-300/10"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => void saveProperties(server, true)}
                        className="bg-emerald-300 px-4 py-2 text-sm font-black text-black"
                      >
                        Save + Restart
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 border-t border-red-400/20 pt-5">
                <h3 className="text-sm font-black text-red-200">Re-world</h3>
                <p className="mt-2 text-xs leading-5 text-stone-400">
                  พิมพ์ชื่อ server `{server.id}` เพื่อยืนยัน ระบบจะ stop, backup world, ย้าย world เดิม และ start ใหม่
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={reworldConfirm[server.id] ?? ""}
                    onChange={(event) => setReworldConfirm((previous) => ({ ...previous, [server.id]: event.target.value }))}
                    placeholder={server.id}
                    className="min-w-0 flex-1 border border-red-400/25 bg-black/40 px-3 py-2 text-sm outline-none focus:border-red-300"
                  />
                  <button
                    onClick={() => void runReworld(server)}
                    disabled={reworldConfirm[server.id] !== server.id || Boolean(busyServer)}
                    className="border border-red-400/40 px-4 py-2 text-sm font-black text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Re-world
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="border border-emerald-300/15 bg-black/35 p-5">
            <h2 className="text-xl font-black">Command Presets</h2>
            <div className="mt-4 space-y-2">
              {presets.map((preset, index) => (
                <div key={preset.id} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <input
                    value={preset.label}
                    onChange={(event) => {
                      const next = [...presets];
                      next[index] = { ...preset, label: event.target.value };
                      setPresets(next);
                    }}
                    className="border border-emerald-300/20 bg-black/40 px-3 py-2 text-sm"
                  />
                  <input
                    value={preset.command}
                    onChange={(event) => {
                      const next = [...presets];
                      next[index] = { ...preset, command: event.target.value };
                      setPresets(next);
                    }}
                    className="border border-emerald-300/20 bg-black/40 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => void savePresets(presets.filter((item) => item.id !== preset.id))}
                    className="border border-red-400/30 px-3 py-2 text-xs font-bold text-red-200"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input
                  value={newPreset.label}
                  onChange={(event) => setNewPreset((previous) => ({ ...previous, label: event.target.value }))}
                  placeholder="Label"
                  className="border border-emerald-300/20 bg-black/40 px-3 py-2 text-sm"
                />
                <input
                  value={newPreset.command}
                  onChange={(event) => setNewPreset((previous) => ({ ...previous, command: event.target.value }))}
                  placeholder="Command"
                  className="border border-emerald-300/20 bg-black/40 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => void savePresets([...presets, { id: crypto.randomUUID(), ...newPreset }])}
                  disabled={!newPreset.label.trim() || !newPreset.command.trim()}
                  className="bg-emerald-300 px-3 py-2 text-xs font-black text-black disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <button onClick={() => void savePresets(presets)} className="mt-2 bg-emerald-300 px-4 py-2 text-sm font-black text-black">
                Save Presets
              </button>
            </div>
          </div>

          <div className="border border-emerald-300/15 bg-black/35 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Audit Log</h2>
              <button onClick={() => void loadAudit()} className="border border-emerald-300/25 px-3 py-1.5 text-xs font-bold text-emerald-200">
                Refresh
              </button>
            </div>
            <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap border border-emerald-300/10 bg-black/45 p-3 text-xs text-stone-300">
              {auditLogs.join("\n") || "No audit log yet"}
            </pre>
          </div>
        </section>

        {servers.length === 0 && !loading && (
          <div className="border border-emerald-300/15 bg-black/35 p-8 text-center text-stone-400">
            ยังไม่พบ Minecraft server folder
          </div>
        )}
      </section>
    </main>
  );
}
