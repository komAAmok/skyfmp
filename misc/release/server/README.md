# SkyMP 服务器 / SkyMP Server

局域网、Radmin VPN、Hamachi、公网 VPS 都用同一套流程：启动服务器，玩家在游戏里按 **F2**
填写 `<房主IP>:端口号` 连接。服务器不依赖 Steam、不依赖任何登录/网关服务。

---

## 中文说明

### 1. 准备

* 安装 [Node.js](https://nodejs.org/) 22 或更高版本。
* 把你自己的 Skyrim Special Edition 的 5 个主文件复制到本目录下的 `data\` 文件夹：
  `Skyrim.esm`、`Update.esm`、`Dawnguard.esm`、`HearthFires.esm`、`Dragonborn.esm`。
  （版权原因不能随包分发，详见 `data\PUT-SKYRIM-ESM-FILES-HERE.txt`。）

### 2. 启动

双击 `start-server.bat`。窗口保持打开即为运行中，关闭窗口即停止服务器。

### 3. 让玩家连进来

服务器默认监听 **所有网卡** 的 **7777/UDP**，玩家在游戏里按 F2 填写地址即可：

| 组网方式 | 玩家填写的地址 | 需要额外做的事 |
| --- | --- | --- |
| 同一局域网 | `192.168.x.x:7777`（房主内网 IP，用 `ipconfig` 查看） | Windows 防火墙放行 `node.exe` 的 UDP 入站 |
| Radmin VPN / Hamachi | 房主在该虚拟网卡上的 IP，例如 `26.x.x.x:7777` | 双方都加入同一个虚拟网络 |
| 公网 VPS / 云主机 | `<公网IP>:7777` | 安全组/防火墙放行 7777/UDP（和 3000/TCP，可选） |
| 家宽 + 端口转发 | `<公网IP>:7777` | 路由器把 7777/UDP 转发到房主电脑 |
| Docker | `<宿主机IP>:7777` | 见 `docker-compose.yml` |

**注意 7777 是 UDP，不是 TCP。** 只放行 TCP 会连不上。

### 4. 配置

编辑 `server-settings.json`：

| 字段 | 说明 |
| --- | --- |
| `port` | 游戏端口（UDP），默认 7777 |
| `listenHost` | 监听地址，`""` 表示所有网卡；只想开局域网可填内网 IP |
| `maxPlayers` | 最大人数 |
| `name` | 服务器名称 |
| `offlineMode` | 保持 `true`：不使用外部账号系统 |
| `loadOrder` | 必须与所有玩家的加载顺序完全一致 |
| `password` | 可选。设置后客户端需要放置同样内容的密码文件（见下文） |

改完后重启服务器生效。

### 5. 玩家侧的 mod 一致性

服务器会在 `data\manifest.json` 里写下自己的加载顺序，并通过 HTTP（默认 3000 端口）提供给客户端。
客户端进入世界后会自动比对；不一致时会在屏幕上提示，并在控制台打印差异。
**所有人（含服务器）必须使用相同的 esm/esp 列表和相同顺序**，否则会出现物品/NPC 错位甚至崩溃。

如果不想开放 3000 端口，可以不放行，客户端只会跳过这项检查。

### 6. 可选：设置房间密码

在服务器 `server-settings.json` 里加 `"password": "你的密码"`，
并让每个玩家在游戏目录建立文件 `Data\Platform\Distribution\password`，内容就是同样的密码。
内容不一致的客户端会被拒绝连接。

### 7. 常见问题

* **连不上，客户端显示 "无法连接到房主"** — 端口没放行（记得是 UDP），或地址填错。
  先在房主机器上用 `127.0.0.1:7777` 自测，能连上说明服务器本身正常，问题在网络层。
* **服务器窗口报 `data/Skyrim.esm` 找不到** — esm 文件没放进 `data\`。
* **多个玩家在同一个路由器后面连公网服务器时，有人被拒** — 引擎对同一 IP 的高频连接有限流，
  间隔几秒再试即可。
* **玩家进游戏后角色互相重叠/共用** — 说明两个客户端用了同一个存档身份。客户端会为每台机器
  生成独立标识并保存在 `Data\Platform\PluginsNoLoad\connect-data-no-load.js`，
  不要在机器之间复制这个文件。

---

## English

### Requirements

* [Node.js](https://nodejs.org/) 22 or newer.
* The five Skyrim Special Edition master files copied into `data\`
  (`Skyrim.esm`, `Update.esm`, `Dawnguard.esm`, `HearthFires.esm`, `Dragonborn.esm`).
  They are not redistributable — see `data\PUT-SKYRIM-ESM-FILES-HERE.txt`.

### Running

Double-click `start-server.bat` and leave the window open.

The server listens on **all interfaces, port 7777/UDP** by default. Players enter
`<host address>:7777` in the in-game menu (**F2**):

* Same LAN — the host's local address, e.g. `192.168.1.10:7777`.
* Radmin VPN / Hamachi — the host's address on the virtual adapter, e.g. `26.x.x.x:7777`.
* Public VPS — `<public IP>:7777`; allow 7777/UDP in the firewall and security group.
* Home connection — forward 7777/UDP on the router to the host machine.
* Docker — see `docker-compose.yml`.

Note that the game port is **UDP**. Opening only TCP will not work.

### Configuration

`server-settings.json`: `port`, `listenHost` (`""` = all interfaces), `maxPlayers`,
`name`, `loadOrder` (must match every client exactly), optional `password`.
Keep `offlineMode` set to `true` — that is what makes the server work without any
external account service. Restart the server after editing.

### Load order verification

The server writes its load order to `data\manifest.json` and serves it over HTTP
on port 3000 (game port + 1 when the game port is not 7777). Clients compare
their own load order against it after spawning and report mismatches on screen
and in the console. Every player and the server must use the same plugin list in
the same order. If port 3000 is closed, clients simply skip the check.
