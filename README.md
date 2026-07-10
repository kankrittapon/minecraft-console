# Minecraft Console

Private Tailscale-only console for managing Minecraft Docker servers on the host.

## Scope

- Separate from the Audio Reader project.
- Uses the same Supabase Auth public env values.
- Binds only to the Tailscale IP via Docker Compose.
- Discovers servers under `/home/kanfullbuster/minecraft-server`.
- Controls only Docker containers whose names start with `mc-`.

## Deploy

Copy `.env.example` to `.env` on the server and fill the Supabase values.

```bash
docker compose up -d --build minecraft-console
```

Open:

```text
http://100.68.88.63:3100
```
