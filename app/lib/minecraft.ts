import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MINECRAFT_ROOT = process.env.MINECRAFT_ROOT ?? "/minecraft-server";
const APP_DATA_DIR = process.env.APP_DATA_DIR ?? path.join(process.cwd(), "data");
const PRESETS_PATH = path.join(APP_DATA_DIR, "command-presets.json");
const AUDIT_PATH = path.join(APP_DATA_DIR, "audit.log");
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const SAFE_COMMAND_PATTERN = /^[^\r\n]{1,240}$/;

export interface MinecraftServer {
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

export interface CommandPreset {
  id: string;
  label: string;
  command: string;
}

export interface ServerProperties {
  lines: Array<{ type: "comment" | "blank" | "property"; raw: string; key?: string; value?: string }>;
  values: Record<string, string>;
}

interface DockerContainer {
  name: string;
  image: string;
  state: string;
  status: string;
  health: string | null;
  ports: string;
  createdAt: string | null;
  composeWorkingDir: string | null;
}

const exists = async (targetPath: string) => {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const ensureDataDir = async () => {
  await mkdir(APP_DATA_DIR, { recursive: true });
};

export const appendAudit = async (entry: Record<string, unknown>) => {
  await ensureDataDir();
  await writeFile(AUDIT_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { flag: "a" });
};

const runDocker = async (args: string[]) => {
  const { stdout } = await execFileAsync("docker", args, { timeout: 15000, maxBuffer: 1024 * 1024 });
  return stdout.toString();
};

const listMinecraftContainers = async (): Promise<DockerContainer[]> => {
  const stdout = await runDocker([
    "ps",
    "-a",
    "--filter",
    "name=mc-",
    "--format",
    "{{json .}}",
  ]);

  const rows = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string>);

  const containers = await Promise.all(
    rows.map(async (row) => {
      const rawName = row.Names ?? "";
      const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
      const inspect = await runDocker([
        "inspect",
        name,
        "--format",
        "{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
      ]);
      const [composeWorkingDir, health] = inspect.trim().split("|");

      return {
        name,
        image: row.Image ?? "",
        state: row.State ?? "",
        status: row.Status ?? "",
        health: health || null,
        ports: row.Ports ?? "",
        createdAt: row.CreatedAt ?? null,
        composeWorkingDir: composeWorkingDir && composeWorkingDir !== "<no value>" ? composeWorkingDir : null,
      };
    }),
  );

  return containers.filter((container) => container.name.startsWith("mc-"));
};

export const listServers = async (): Promise<MinecraftServer[]> => {
  const entries = await readdir(MINECRAFT_ROOT, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory() && SAFE_ID_PATTERN.test(entry.name));
  const containers = await listMinecraftContainers();

  const servers = await Promise.all(
    folders.map(async (folder) => {
      const folderPath = path.join(MINECRAFT_ROOT, folder.name);
      const dataPath = path.join(folderPath, "data");
      const worldPath = path.join(dataPath, "world");
      const propertiesPath = path.join(dataPath, "server.properties");
      const composePath = path.join(folderPath, "docker-compose.yml");
      const hostFolderSuffix = `/minecraft-server/${folder.name}`;
      const container =
        containers.find((item) => item.name === `mc-${folder.name}`) ??
        containers.find((item) => item.composeWorkingDir?.endsWith(hostFolderSuffix)) ??
        null;

      return {
        id: folder.name,
        folderPath,
        dataPath: (await exists(dataPath)) ? dataPath : null,
        worldPath: (await exists(worldPath)) ? worldPath : null,
        propertiesPath: (await exists(propertiesPath)) ? propertiesPath : null,
        composePath: (await exists(composePath)) ? composePath : null,
        containerName: container?.name ?? null,
        image: container?.image ?? null,
        state: container?.state ?? "not-created",
        status: container?.status ?? "No container",
        health: container?.health ?? null,
        ports: container?.ports ?? "",
        createdAt: container?.createdAt ?? null,
      };
    }),
  );

  return servers.sort((left, right) => left.id.localeCompare(right.id));
};

export const controlServer = async (serverId: string, action: "start" | "stop" | "restart") => {
  if (!SAFE_ID_PATTERN.test(serverId)) {
    throw new Error("Invalid server id");
  }

  const servers = await listServers();
  const server = servers.find((item) => item.id === serverId);
  if (!server?.containerName || !server.containerName.startsWith("mc-")) {
    throw new Error("Minecraft container was not found");
  }

  await runDocker([action, server.containerName]);
  return server.containerName;
};

const getServerOrThrow = async (serverId: string) => {
  if (!SAFE_ID_PATTERN.test(serverId)) throw new Error("Invalid server id");
  const servers = await listServers();
  const server = servers.find((item) => item.id === serverId);
  if (!server) throw new Error("Minecraft server was not found");
  return server;
};

export const sendRconCommand = async (serverId: string, command: string) => {
  if (!SAFE_COMMAND_PATTERN.test(command)) throw new Error("Command must be a single line and under 240 characters");
  const server = await getServerOrThrow(serverId);
  if (!server.containerName || !server.containerName.startsWith("mc-")) throw new Error("Minecraft container was not found");

  const { stdout, stderr } = await execFileAsync("docker", ["exec", server.containerName, "rcon-cli", command], {
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  return { output: stdout.toString().trim() || stderr.toString().trim() || "Command sent", containerName: server.containerName };
};

const defaultPresets: CommandPreset[] = [
  { id: "list", label: "List players", command: "list" },
  { id: "save-all", label: "Save world", command: "save-all" },
  { id: "day", label: "Set day", command: "time set day" },
  { id: "clear-weather", label: "Clear weather", command: "weather clear" },
  { id: "keep-inventory-on", label: "Keep inventory ON", command: "gamerule keepInventory true" },
  { id: "keep-inventory-off", label: "Keep inventory OFF", command: "gamerule keepInventory false" },
  { id: "mob-griefing-off", label: "Mob griefing OFF", command: "gamerule mobGriefing false" },
  { id: "daylight-off", label: "Daylight cycle OFF", command: "gamerule doDaylightCycle false" },
  { id: "weather-off", label: "Weather cycle OFF", command: "gamerule doWeatherCycle false" },
  { id: "maintenance", label: "Maintenance notice", command: "say Server maintenance in 5 minutes" },
];

export const readPresets = async () => {
  await ensureDataDir();
  try {
    const raw = await readFile(PRESETS_PATH, "utf8");
    const parsed = JSON.parse(raw) as CommandPreset[];
    if (!Array.isArray(parsed)) return defaultPresets;
    const existingIds = new Set(parsed.map((preset) => preset.id));
    const mergedPresets = [...parsed, ...defaultPresets.filter((preset) => !existingIds.has(preset.id))];
    if (mergedPresets.length !== parsed.length) {
      await writeFile(PRESETS_PATH, JSON.stringify(mergedPresets, null, 2));
    }
    return mergedPresets;
  } catch {
    await writeFile(PRESETS_PATH, JSON.stringify(defaultPresets, null, 2));
    return defaultPresets;
  }
};

export const savePresets = async (presets: CommandPreset[]) => {
  await ensureDataDir();
  const invalidPreset = presets.find(
    (preset) => !preset.label?.trim() || !SAFE_COMMAND_PATTERN.test(preset.command?.trim() ?? ""),
  );
  if (invalidPreset) {
    throw new Error("Preset label and command are required. Command must be a single line and under 240 characters.");
  }

  const safePresets = presets.map((preset) => ({
    id: preset.id || randomUUID(),
    label: preset.label.trim().slice(0, 80),
    command: preset.command.trim().slice(0, 240),
  }));
  await writeFile(PRESETS_PATH, JSON.stringify(safePresets, null, 2));
  return safePresets;
};

export const readAudit = async () => {
  await ensureDataDir();
  try {
    const raw = await readFile(AUDIT_PATH, "utf8");
    return raw.split("\n").filter(Boolean).slice(-100).reverse();
  } catch {
    return [];
  }
};

const parseProperties = (raw: string): ServerProperties => {
  const values: Record<string, string> = {};
  const lines = raw.split(/\r?\n/).map((line) => {
    if (!line.trim()) return { type: "blank" as const, raw: line };
    if (line.trim().startsWith("#")) return { type: "comment" as const, raw: line };
    const equalIndex = line.indexOf("=");
    if (equalIndex < 0) return { type: "comment" as const, raw: line };
    const key = line.slice(0, equalIndex);
    const value = line.slice(equalIndex + 1);
    values[key] = value;
    return { type: "property" as const, raw: line, key, value };
  });
  return { lines, values };
};

export const readServerProperties = async (serverId: string) => {
  const server = await getServerOrThrow(serverId);
  if (!server.propertiesPath) throw new Error("server.properties was not found");
  return parseProperties(await readFile(server.propertiesPath, "utf8"));
};

export const writeServerProperties = async (serverId: string, values: Record<string, string>) => {
  const server = await getServerOrThrow(serverId);
  if (!server.propertiesPath) throw new Error("server.properties was not found");
  const parsed = parseProperties(await readFile(server.propertiesPath, "utf8"));
  const backupPath = `${server.propertiesPath}.bak-${timestamp()}`;
  await copyFile(server.propertiesPath, backupPath);

  const seen = new Set<string>();
  const nextLines = parsed.lines.map((line) => {
    if (line.type !== "property" || !line.key) return line.raw;
    seen.add(line.key);
    return `${line.key}=${values[line.key] ?? line.value ?? ""}`;
  });
  Object.entries(values).forEach(([key, value]) => {
    if (/^[a-zA-Z0-9_.-]+$/.test(key) && !seen.has(key)) nextLines.push(`${key}=${value}`);
  });
  await writeFile(server.propertiesPath, nextLines.join("\n"));
  return backupPath;
};

export const reworldServer = async (serverId: string) => {
  const server = await getServerOrThrow(serverId);
  if (!server.containerName || !server.containerName.startsWith("mc-")) throw new Error("Minecraft container was not found");
  if (!server.worldPath || !server.dataPath) throw new Error("World folder was not found");

  if (server.state === "running") {
    await sendRconCommand(serverId, "save-all").catch(() => null);
    await runDocker(["stop", server.containerName]);
  }
  const backupRoot = path.join(server.dataPath, "world-backups");
  await mkdir(backupRoot, { recursive: true });
  const backupPath = path.join(backupRoot, `world-${timestamp()}`);
  await rename(server.worldPath, backupPath);
  if (await exists(server.worldPath)) {
    await rm(server.worldPath, { recursive: true });
  }
  await runDocker(["start", server.containerName]);
  return backupPath;
};
