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
- สแกน server ใต้ `<HOST_MINECRAFT_ROOT>`
- ควบคุมเฉพาะ Docker container ที่ชื่อขึ้นต้นด้วย `mc-`

URL ปัจจุบัน:

```text
http://<TAILSCALE_IP>:3100
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
- ส่งคำสั่ง Admin ผ่าน RCON ด้วย `rcon-cli`
- เพิ่ม/แก้/ลบ command presets ผ่านเว็บ
- แก้ค่า `server.properties` ผ่านเว็บ พร้อม backup ก่อน save
- Re-world แบบ backup-first
- Audit log สำหรับ action สำคัญ

### โครงสร้าง server ที่รองรับ

ระบบจะสแกน folder ใต้:

```text
<HOST_MINECRAFT_ROOT>
```

ตัวอย่าง:

```text
<HOST_MINECRAFT_ROOT>/superior
<HOST_MINECRAFT_ROOT>/superior/docker-compose.yml
<HOST_MINECRAFT_ROOT>/superior/data
<HOST_MINECRAFT_ROOT>/superior/data/world
<HOST_MINECRAFT_ROOT>/superior/data/server.properties
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

- `Site URL` คงไว้เป็นของโปรเจกต์หลักได้ เช่น `<MAIN_SITE_URL>`
- เพิ่ม Redirect URLs:

```text
http://<TAILSCALE_IP>:3100
http://<TAILSCALE_IP>:3100/*
```

หมายเหตุ: แอปนี้ใช้ `window.location.origin` ตอนส่ง Magic Link ดังนั้นถ้าเปิดจาก `http://<TAILSCALE_IP>:3100` ระบบจะขอ redirect กลับ URL นี้

### Environment variables

ไฟล์ตัวอย่าง:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_EMAILS=your@email.com
NEXT_PUBLIC_SITE_URL=http://<TAILSCALE_IP>:3100
MINECRAFT_ROOT=/minecraft-server
TAILSCALE_BIND_IP=<TAILSCALE_IP>
HOST_MINECRAFT_ROOT=<HOST_MINECRAFT_ROOT>
```

บน server ตอน deploy ด้วย Docker Compose:

- `MINECRAFT_ROOT` ใน container คือ `/minecraft-server`
- bind mount จาก host:

```text
<HOST_MINECRAFT_ROOT>:/minecraft-server:rw
```

### Deploy

บน server:

```bash
cd <CONSOLE_PROJECT_DIR>
docker compose up -d --build minecraft-console
```

ตรวจ container:

```bash
docker ps --filter name=minecraft-console
```

ตรวจว่าเว็บตอบ:

```bash
curl -I http://<TAILSCALE_IP>:3100
```

### วิธีใช้งาน

1. เปิดเว็บผ่าน Tailscale:

```text
http://<TAILSCALE_IP>:3100
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
- `Admin Commands` เพื่อส่งคำสั่ง RCON หรือกด preset
- `Command Presets` เพื่อจัดการคำสั่งลัด
- `server.properties` เพื่อโหลด/แก้/บันทึก config และเลือก Save + Restart
- `Re-world` เพื่อสร้างโลกใหม่ โดยต้องพิมพ์ชื่อ server เพื่อยืนยัน
- `Audit Log` เพื่อดู action ล่าสุด

### Admin Commands / RCON

ระบบใช้คำสั่ง:

```bash
docker exec <mc-container> rcon-cli "<command>"
```

ตัวอย่างคำสั่ง:

```text
list
save-all
time set day
weather clear
say Server maintenance in 5 minutes
```

ข้อจำกัด:

- รับคำสั่งบรรทัดเดียวเท่านั้น
- จำกัดความยาว 240 ตัวอักษร
- ไม่รับ shell command

### คู่มือคำสั่งที่ใช้บ่อย

คำสั่งทั้งหมดในช่อง Admin Commands คือคำสั่ง Minecraft/RCON ไม่ใช่คำสั่ง Linux shell

สัญลักษณ์ที่ใช้ในตัวอย่าง:

- `<player>` คือชื่อผู้เล่น เช่น `Steve`
- `<message>` คือข้อความที่ต้องการประกาศ
- `<amount>` คือจำนวน เช่น `64`
- `<x> <y> <z>` คือพิกัดในโลก Minecraft

คำสั่งดูสถานะ:

```text
list
tps
seed
version
```

คำสั่งประกาศ/สื่อสาร:

```text
say <message>
say Server maintenance in 5 minutes
tell <player> <message>
title <player> title {"text":"Welcome","color":"gold"}
```

คำสั่งบันทึก/ดูแล server:

```text
save-all
save-off
save-on
stop
```

หมายเหตุ: แนะนำใช้ปุ่ม Stop ของเว็บแทนคำสั่ง `stop` เพราะเว็บจะรู้สถานะ container ต่อได้ชัดกว่า

คำสั่งเวลา/สภาพอากาศ:

```text
time set day
time set night
weather clear
weather rain
weather thunder
gamerule doDaylightCycle false
gamerule doWeatherCycle false
```

คำสั่งผู้เล่น:

```text
op <player>
deop <player>
kick <player> <message>
ban <player> <message>
pardon <player>
whitelist on
whitelist off
whitelist add <player>
whitelist remove <player>
whitelist reload
```

คำสั่ง teleport:

```text
tp <player> <targetPlayer>
tp <player> <x> <y> <z>
spawnpoint <player>
setworldspawn
setworldspawn <x> <y> <z>
```

คำสั่ง gameplay:

```text
gamemode survival <player>
gamemode creative <player>
difficulty peaceful
difficulty easy
difficulty normal
difficulty hard
effect clear <player>
kill <player>
```

คำสั่ง item/xp:

```text
give <player> minecraft:diamond <amount>
give <player> minecraft:bread 16
xp add <player> 10 levels
clear <player>
```

คำสั่งที่เหมาะทำเป็น preset:

```text
list
save-all
time set day
weather clear
say Server maintenance in 5 minutes
whitelist reload
gamerule keepInventory true
```

คำสั่งที่ควรระวัง:

```text
stop
kill <player>
ban <player>
clear <player>
gamerule randomTickSpeed <number>
```

ก่อนใช้คำสั่งที่กระทบผู้เล่นหรือโลก ควรส่ง `save-all` ก่อนเสมอ

### server.properties editor

ระบบอ่านไฟล์:

```text
/minecraft-server/<server-id>/data/server.properties
```

ก่อนบันทึกจะ backup เป็น:

```text
server.properties.bak-YYYY-MM-DDTHH-mm-ss-sssZ
```

ปุ่ม:

- `Save` บันทึกไฟล์อย่างเดียว
- `Save + Restart` บันทึกแล้ว restart server

### Re-world

ขั้นตอน:

1. ส่ง `save-all`
2. Stop container
3. สร้าง folder `data/world-backups`
4. ย้าย `data/world` ไปเป็น backup
5. Start container เพื่อให้ server สร้าง world ใหม่

Re-world จะไม่ลบ world แบบถาวรทันที แต่จะย้ายไป backup ก่อนเสมอ

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

- ปรับ UI properties editor ให้เลือก key เพิ่มเติมได้
- Restore world จาก backup
- Export/import command presets
- กรอง Audit log ตาม server/user/action

---

## English

### Overview

`minecraft-console` is a private web console for viewing and controlling Minecraft Docker servers on the same host.

Main goals:

- Fully separate from the existing Audio Reader/Speechy project
- Tailscale-only access
- Reuse the same Supabase Auth project/env values as the Reading app
- Discover servers under `<HOST_MINECRAFT_ROOT>`
- Control only Docker containers whose names start with `mc-`

Current URL:

```text
http://<TAILSCALE_IP>:3100
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
- Admin commands through RCON using `rcon-cli`
- Web-managed command presets
- `server.properties` editor with backup before save
- Backup-first Re-world flow
- Audit log for important actions

### Supported server layout

The console scans folders under:

```text
<HOST_MINECRAFT_ROOT>
```

Example:

```text
<HOST_MINECRAFT_ROOT>/superior
<HOST_MINECRAFT_ROOT>/superior/docker-compose.yml
<HOST_MINECRAFT_ROOT>/superior/data
<HOST_MINECRAFT_ROOT>/superior/data/world
<HOST_MINECRAFT_ROOT>/superior/data/server.properties
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

- Keep `Site URL` as the main app URL if needed, for example `<MAIN_SITE_URL>`
- Add these Redirect URLs:

```text
http://<TAILSCALE_IP>:3100
http://<TAILSCALE_IP>:3100/*
```

Note: this app uses `window.location.origin` when sending the Magic Link, so opening the app from `http://<TAILSCALE_IP>:3100` requests a redirect back to that exact origin.

### Environment variables

Example `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_EMAILS=your@email.com
NEXT_PUBLIC_SITE_URL=http://<TAILSCALE_IP>:3100
MINECRAFT_ROOT=/minecraft-server
TAILSCALE_BIND_IP=<TAILSCALE_IP>
HOST_MINECRAFT_ROOT=<HOST_MINECRAFT_ROOT>
```

In Docker Compose:

- `MINECRAFT_ROOT` inside the container is `/minecraft-server`
- Host mount:

```text
<HOST_MINECRAFT_ROOT>:/minecraft-server:rw
```

### Deploy

On the server:

```bash
cd <CONSOLE_PROJECT_DIR>
docker compose up -d --build minecraft-console
```

Check the container:

```bash
docker ps --filter name=minecraft-console
```

Check the HTTP response:

```bash
curl -I http://<TAILSCALE_IP>:3100
```

### Usage

1. Open the app through Tailscale:

```text
http://<TAILSCALE_IP>:3100
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
- `Admin Commands` to send RCON commands or run presets
- `Command Presets` to manage shortcut commands
- `server.properties` to load/edit/save config and optionally restart
- `Re-world` to regenerate a world after typing the server id for confirmation
- `Audit Log` to inspect recent actions

### Admin Commands / RCON

The system runs:

```bash
docker exec <mc-container> rcon-cli "<command>"
```

Example commands:

```text
list
save-all
time set day
weather clear
say Server maintenance in 5 minutes
```

Restrictions:

- Single-line commands only
- Maximum 240 characters
- No raw shell commands

### Common command guide

Commands entered in Admin Commands are Minecraft/RCON commands, not Linux shell commands.

Placeholders used below:

- `<player>` means a player name, for example `Steve`
- `<message>` means the message to send
- `<amount>` means a number, for example `64`
- `<x> <y> <z>` means Minecraft world coordinates

Status commands:

```text
list
tps
seed
version
```

Announcement/chat commands:

```text
say <message>
say Server maintenance in 5 minutes
tell <player> <message>
title <player> title {"text":"Welcome","color":"gold"}
```

Server maintenance commands:

```text
save-all
save-off
save-on
stop
```

Note: prefer the web Stop button over the `stop` command so the console can track container state more clearly.

Time/weather commands:

```text
time set day
time set night
weather clear
weather rain
weather thunder
gamerule doDaylightCycle false
gamerule doWeatherCycle false
```

Player commands:

```text
op <player>
deop <player>
kick <player> <message>
ban <player> <message>
pardon <player>
whitelist on
whitelist off
whitelist add <player>
whitelist remove <player>
whitelist reload
```

Teleport commands:

```text
tp <player> <targetPlayer>
tp <player> <x> <y> <z>
spawnpoint <player>
setworldspawn
setworldspawn <x> <y> <z>
```

Gameplay commands:

```text
gamemode survival <player>
gamemode creative <player>
difficulty peaceful
difficulty easy
difficulty normal
difficulty hard
effect clear <player>
kill <player>
```

Item/XP commands:

```text
give <player> minecraft:diamond <amount>
give <player> minecraft:bread 16
xp add <player> 10 levels
clear <player>
```

Good preset candidates:

```text
list
save-all
time set day
weather clear
say Server maintenance in 5 minutes
whitelist reload
gamerule keepInventory true
```

Commands to use carefully:

```text
stop
kill <player>
ban <player>
clear <player>
gamerule randomTickSpeed <number>
```

Before running commands that affect players or the world, run `save-all` first.

### server.properties editor

The system reads:

```text
/minecraft-server/<server-id>/data/server.properties
```

Before saving, it creates:

```text
server.properties.bak-YYYY-MM-DDTHH-mm-ss-sssZ
```

Buttons:

- `Save` only writes the file
- `Save + Restart` writes the file and restarts the server

### Re-world

Flow:

1. Send `save-all`
2. Stop the container
3. Create `data/world-backups`
4. Move `data/world` to a timestamped backup
5. Start the container so Minecraft can generate a fresh world

Re-world does not permanently delete the world immediately. It moves the old world to a backup first.

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

- Better properties UI for adding more keys
- Restore world from backup
- Export/import command presets
- Audit log filtering by server/user/action
