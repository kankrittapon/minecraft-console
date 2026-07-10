import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MINECRAFT_ROOT = process.env.MINECRAFT_ROOT ?? "/minecraft-server";
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

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
