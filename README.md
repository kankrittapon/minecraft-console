# Minecraft Console

Private web console for managing Minecraft Docker servers on a Tailscale network.

This project is separate from the Audio Reader/Speechy project. It uses the same Supabase Auth project/env values, but runs as its own Docker service and is intended to be opened only through the server's Tailscale IP.

---

## ภาษาไทย

### ภาพรวม

`minecraft-console` คือหน้าเว็บส่วนตัวสำหรับดูและควบคุม Minecraft servers ที่รันด้วย Docker บนเครื่อง server เดียวกัน

เป้าหมายหลัก:

- แยกจากระบบ Audio Reader เดิม ไม่แตะ repo หรือ container ของ Reading
- ใช้งานผ่าน Tailscale เท่านั้น
- ใช้ Supabase Auth ชุดเดียวกับ Reading ได้
- สแกน server ใต้ `/home/kanfullbuster/minecraft-server`
- ควบคุมเฉพาะ Docker container ที่ชื่อขึ้นต้นด้วย `mc-`

URL ปัจจุบัน:

```text
http://100.68.88.63:3100
```

### ฟังก์ชั่นที่มีตอนนี้

- Login ด้วย Supabase Magic Link
- Login ด้วย Supabase Email + Password เป็น fallback เมื่อ Magic Link ติด rate limit
- ตรวจ allowlist ด้วย `NEXT_PUBLIC_ALLOWED_EMAILS`
- Dashboard แสดง Minecraft server folders
- แสดง container/status/health/port/image/world path
- ปุ่ม Refresh
- ปุ่ม Start / Stop / Restart สำหรับ container ที่ชื่อ `mc-*`
- Bind port เฉพาะ Tailscale IP ผ่าน Docker Compose

### โครงสร้าง server ที่รองรับ

ระบบจะสแกน folder ใต้:

```text
/home/kanfullbuster/minecraft-server
```

ตัวอย่าง:

```text
/home/kanfullbuster/minecraft-server/superior
/home/kanfullbuster/minecraft-server/superior/docker-compose.yml
/home/kanfullbuster/minecraft-server/superior/data
/home/kanfullbuster/minecraft-server/superior/data/world
/home/kanfullbuster/minecraft-server/superior/data/server.properties
```

Container ควรตั้งชื่อเป็นรูปแบบ:

```text
mc-<server-id>
```

เช่น:

```text
mc-superior
```

### Auth / Supabase setup

ใช้ env เดียวกับ Reading ได้:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_EMAILS=your@email.com
```

สำหรับ Supabase Auth URL Configuration:

- `Site URL` คงไว้เป็นของโปรเจกต์หลักได้ เช่น `https://speechy.kankrittapon.online`
- เพิ่ม Redirect URLs:

```text
http://100.68.88.63:3100
http://100.68.88.63:3100/*
```

หมายเหตุ: แอปนี้ใช้ `window.location.origin` ตอนส่ง Magic Link ดังนั้นถ้าเปิดจาก `http://100.68.88.63:3100` ระบบจะขอ redirect กลับ URL นี้

### Environment variables

ไฟล์ตัวอย่าง:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_EMAILS=your@email.com
NEXT_PUBLIC_SITE_URL=http://100.68.88.63:3100
MINECRAFT_ROOT=/minecraft-server
TAILSCALE_BIND_IP=100.68.88.63
```

บน server ตอน deploy ด้วย Docker Compose:

- `MINECRAFT_ROOT` ใน container คือ `/minecraft-server`
- bind mount จาก host:

```text
/home/kanfullbuster/minecraft-server:/minecraft-server:rw
```

### Deploy

บน server:

```bash
cd /home/kanfullbuster/minecraft-console
docker compose up -d --build minecraft-console
```

ตรวจ container:

```bash
docker ps --filter name=minecraft-console
```

ตรวจว่าเว็บตอบ:

```bash
curl -I http://100.68.88.63:3100
```

### วิธีใช้งาน

1. เปิดเว็บผ่าน Tailscale:

```text
http://100.68.88.63:3100
```

2. กรอกอีเมลที่อยู่ใน allowlist
3. เลือกวิธี login:
   - กดส่ง Magic Link แล้วเปิดลิงก์จากอีเมล
   - หรือใส่ password แล้วกดเข้าสู่ระบบด้วยรหัสผ่าน
4. หน้า Dashboard จะสแกน Minecraft servers ให้อัตโนมัติ
5. ใช้ปุ่ม:

- `Refresh` เพื่อสแกนใหม่
- `start` เพื่อเปิด container
- `stop` เพื่อปิด container
- `restart` เพื่อ restart container

ถ้าเจอ `email rate limit exceeded` ให้ตั้ง password ให้ user ใน Supabase Dashboard แล้วใช้ช่อง password แทน Magic Link ได้ทันที

### Security notes

โปรเจกต์นี้ mount Docker socket:

```text
/var/run/docker.sock:/var/run/docker.sock
```

ดังนั้น service นี้มีสิทธิ์ควบคุม Docker บน host ได้ ควรใช้งานเฉพาะบน Tailscale และเฉพาะ user ที่อยู่ใน allowlist เท่านั้น

โค้ดฝั่ง API จำกัด scope ไว้ดังนี้:

- ต้องมี Supabase session ที่ถูกต้อง
- อีเมลต้องอยู่ใน allowlist หากกำหนดไว้
- scan เฉพาะ `/minecraft-server`
- action เฉพาะ `start`, `stop`, `restart`
- ควบคุมเฉพาะ container ที่ชื่อขึ้นต้น `mc-`
- ไม่รับ shell command ดิบจาก frontend

### Planned features

ฟีเจอร์ที่ควรทำต่อ:

- RCON command console
- Preset commands ที่เพิ่ม/ลบผ่านเว็บได้
- `server.properties` editor พร้อม backup ก่อน save
- Re-world แบบปลอดภัย: stop server -> backup world -> remove world -> start server
- Audit log ว่าใครสั่ง action อะไร เวลาไหน

---

## English

### Overview

`minecraft-console` is a private web console for viewing and controlling Minecraft Docker servers on the same host.

Main goals:

- Fully separate from the existing Audio Reader/Speechy project
- Tailscale-only access
- Reuse the same Supabase Auth project/env values as the Reading app
- Discover servers under `/home/kanfullbuster/minecraft-server`
- Control only Docker containers whose names start with `mc-`

Current URL:

```text
http://100.68.88.63:3100
```

### Current features

- Supabase Magic Link login
- Supabase Email + Password fallback when Magic Link is rate-limited
- Email allowlist using `NEXT_PUBLIC_ALLOWED_EMAILS`
- Server dashboard
- Shows container name, status, health, ports, image, and world path
- Refresh button
- Start / Stop / Restart buttons for `mc-*` containers
- Docker Compose binds the web port only to the Tailscale IP

### Supported server layout

The console scans folders under:

```text
/home/kanfullbuster/minecraft-server
```

Example:

```text
/home/kanfullbuster/minecraft-server/superior
/home/kanfullbuster/minecraft-server/superior/docker-compose.yml
/home/kanfullbuster/minecraft-server/superior/data
/home/kanfullbuster/minecraft-server/superior/data/world
/home/kanfullbuster/minecraft-server/superior/data/server.properties
```

Containers should be named:

```text
mc-<server-id>
```

Example:

```text
mc-superior
```

### Auth / Supabase setup

You can reuse the same public Supabase env values as the Reading app:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_EMAILS=your@email.com
```

In Supabase Auth URL Configuration:

- Keep `Site URL` as the main app URL if needed, for example `https://speechy.kankrittapon.online`
- Add these Redirect URLs:

```text
http://100.68.88.63:3100
http://100.68.88.63:3100/*
```

Note: this app uses `window.location.origin` when sending the Magic Link, so opening the app from `http://100.68.88.63:3100` requests a redirect back to that exact origin.

### Environment variables

Example `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_EMAILS=your@email.com
NEXT_PUBLIC_SITE_URL=http://100.68.88.63:3100
MINECRAFT_ROOT=/minecraft-server
TAILSCALE_BIND_IP=100.68.88.63
```

In Docker Compose:

- `MINECRAFT_ROOT` inside the container is `/minecraft-server`
- Host mount:

```text
/home/kanfullbuster/minecraft-server:/minecraft-server:rw
```

### Deploy

On the server:

```bash
cd /home/kanfullbuster/minecraft-console
docker compose up -d --build minecraft-console
```

Check the container:

```bash
docker ps --filter name=minecraft-console
```

Check the HTTP response:

```bash
curl -I http://100.68.88.63:3100
```

### Usage

1. Open the app through Tailscale:

```text
http://100.68.88.63:3100
```

2. Enter an allowlisted email address
3. Choose a login method:
   - Send a Magic Link and open it from your email
   - Or enter a password and use password login
4. The dashboard scans Minecraft servers automatically
5. Use:

- `Refresh` to rescan
- `start` to start a container
- `stop` to stop a container
- `restart` to restart a container

If you see `email rate limit exceeded`, set a password for the user in the Supabase Dashboard and use password login instead of Magic Link.

### Security notes

This project mounts the Docker socket:

```text
/var/run/docker.sock:/var/run/docker.sock
```

That means this service can control Docker on the host. It should only be exposed through Tailscale and only to allowlisted users.

The API is intentionally scoped:

- Requires a valid Supabase session
- Requires an allowlisted email when `NEXT_PUBLIC_ALLOWED_EMAILS` is set
- Scans only `/minecraft-server`
- Allows only `start`, `stop`, and `restart`
- Controls only containers whose names start with `mc-`
- Does not accept raw shell commands from the frontend

### Planned features

Suggested next features:

- RCON command console
- Web-managed command presets
- `server.properties` editor with automatic backup
- Safe Re-world flow: stop server -> backup world -> remove world -> start server
- Audit log for server actions
