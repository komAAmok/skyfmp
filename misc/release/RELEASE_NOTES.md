# SkyMP — 局域网 / 直连联机版

两个压缩包，下载对应的那个：

| 文件 | 用途 |
| --- | --- |
| `skymp-client-*.zip` | **客户端 mod**。用 Mod Organizer 2 安装，SKSE 启动，进游戏按 **F2** 填 `<房主IP>:端口号` 连接。 |
| `skymp-server-win-*.zip` | **服务器**（Windows）。解压后把自己的 Skyrim 主文件放进 `data\`，双击 `start-server.bat`。 |

每个压缩包内都有 `README.md`（中英双语），包含完整的安装、联机与排错说明。

## 说明

* 支持 Skyrim Special Edition **1.5.x（SE）** 与 **1.6.x（AE）**，同一个压缩包通吃；
  Address Library 已内置，无需另外下载。需要与游戏版本匹配的 SKSE64。
* 不依赖 Steam，不需要账号或登录，不连接任何网关/授权服务器。
* 组网方式任选：同一局域网、Radmin VPN、Hamachi、家宽端口转发、公网 VPS、Docker。
  游戏端口是 **7777/UDP**，放行时不要只放 TCP。
* 所有玩家与服务器的 mod 加载顺序必须一致；客户端进入世界后会自动比对并提示。

---

Client mod and dedicated server for Skyrim Special Edition, connecting by direct
IP with no master server, no account and no Steam integration. One client archive
covers both SE (1.5.x) and AE (1.6.x); the Address Library is bundled. Press
**F2** in game, enter `<host>:<port>`, connect. See the `README.md` inside each
archive for setup and troubleshooting.
