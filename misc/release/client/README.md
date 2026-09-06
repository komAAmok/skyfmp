# SkyMP 客户端 / SkyMP Client

上古卷轴5：天际（特别版）联机 mod。通过 Mod Organizer 2 安装，用 SKSE 启动游戏，
进游戏按 **F2** 呼出联机界面，填写 `<房主IP>:端口号` 即可连接。

不需要 Steam 登录，不需要注册账号，不连接任何网关或授权服务器 —— 只和你填写的那个地址通信。

---

## 中文说明

### 1. 需求

| 项目 | 说明 |
| --- | --- |
| 游戏 | Skyrim Special Edition **1.5.x（SE）** 或 **1.6.x（AE）**，两者都支持 |
| SKSE | 与你游戏版本匹配的 SKSE64（SE 用 2.0.x，AE 用 2.2.x） |
| Address Library | **已包含在本压缩包内**，SE 和 AE 的数据库都有，无需另外下载 |
| 依赖 | 无需 SKSE 之外的其他前置 mod |

### 2. 用 MO2 安装

1. MO2 左侧栏空白处右键 → `Install Mod from Archive…`（或直接把 zip 拖进 MO2）。
2. 选择 `skymp-client-<版本>.zip`。压缩包根目录就是 `Data` 的内容，MO2 会自动识别，
   不需要手动 `Set as data directory`。
3. 在左侧栏勾选启用这个 mod。
4. **加载顺序**：本 mod 不含 esp/esm，不影响右侧插件列表。
5. 从 MO2 右上角选择 SKSE（`skse64_loader.exe`）启动游戏。
   直接双击 `SkyrimSE.exe` 启动是**不行的** —— 那样 SKSE 插件不会加载。

Vortex 或手动安装同样可行：把压缩包内容解压到 `Skyrim Special Edition\Data`。

### 3. 连接

1. 启动游戏，到主菜单即可（不必先读档）。
2. 按 **F2** 打开联机界面。
3. 在输入框填写房主地址，例如 `192.168.1.10:7777`。只填 IP 时端口默认 `7777`。
4. 点 `连接`。连上后服务器会为你创建角色并把你放进世界。
5. 想换服务器或断开：再按 F2，填新地址点连接，或点 `断开`。

填过的地址会被记住，下次直接点连接即可。

### 4. 按键

| 按键 | 作用 |
| --- | --- |
| `F2` | 打开/关闭联机界面 |
| `F1` | 显示/隐藏其他玩家头顶的名字 |
| `F6` | 切换鼠标焦点到界面/游戏 |
| `Esc` | 把焦点交还给游戏 |
| `` ` `` | 游戏控制台（查看日志和报错） |

### 5. 注意事项

* **所有玩家和服务器的 mod 加载顺序必须完全一致。** 进入世界后客户端会自动比对服务器的列表，
  不一致时屏幕上会出现红色提示，控制台里有具体差异。不一致会导致物品/NPC 错位甚至崩溃。
* **联机时不要手动读取单人存档。** 那样客户端会自动切回单人模式并断开连接
  （屏幕上会有提示）。要回到联机就重新按 F2 连接。
* 联机中的角色数据保存在服务器上，不占用你的单人存档。
* 每台电脑第一次连接时会生成自己的身份标识，存在
  `Data\Platform\PluginsNoLoad\connect-data-no-load.js`（MO2 下会落在 overwrite 里）。
  不要把这个文件复制到别的机器，否则两个人会共用同一个角色。

### 6. 连不上时

1. 让房主先在自己机器上用 `127.0.0.1:7777` 试连。能连上说明服务器正常，问题在网络。
2. 房主的防火墙要放行 **7777/UDP** 入站（是 UDP，不是 TCP）。
3. 公网服务器还要在云服务商的安全组里放行 7777/UDP，家宽需要在路由器做端口转发。
4. 用 Radmin VPN / Hamachi 时，填的是虚拟网卡上的地址（例如 `26.x.x.x`），不是内网 IP。
5. 界面提示"房主使用的 mod 版本与你不一致"：双方需要用同一个版本的本 mod。
6. 更多线索看游戏控制台（`` ` ``）和 `My Documents\My Games\Skyrim Special Edition\SKSE\SkyrimPlatform.log`。

---

## English

### Requirements

* Skyrim Special Edition **1.5.x (SE)** or **1.6.x (AE)** — both are supported by
  the same archive.
* SKSE64 matching your game version (2.0.x for SE, 2.2.x for AE).
* Address Library is **bundled** for both runtimes; no separate download.

No Steam sign-in, no account, no gateway: the client only talks to the address
you type in.

### Installing with MO2

Right-click the left pane → `Install Mod from Archive…`, pick
`skymp-client-<version>.zip`, enable it, then launch the game through SKSE
(`skse64_loader.exe`) from MO2. The archive root is the contents of `Data`, so MO2
detects it without any manual "set as data directory" step. Starting
`SkyrimSE.exe` directly will not load the mod.

### Connecting

Press **F2** at the main menu (or in game), type `<host address>:7777` and press
Connect. Entering just an address without a port defaults to 7777. The address is
remembered for next time. Press F2 again to reconnect elsewhere or disconnect.

### Keys

`F2` multiplayer menu · `F1` player nameplates · `F6` toggle UI focus ·
`Esc` return focus to the game · `` ` `` game console.

### Notes

* Every player and the server must use the same plugin load order. The client
  compares against the server after spawning and reports mismatches on screen.
* Loading a single-player save while connected switches the client back to
  single-player mode and drops the connection. Press F2 to rejoin.
* Your multiplayer character lives on the server, not in your local saves.
* A per-machine identity is generated on first connect and stored in
  `Data\Platform\PluginsNoLoad\connect-data-no-load.js` (MO2 puts it in
  overwrite). Do not copy it between machines or two players will share one
  character.

### If the connection fails

The game port is **UDP 7777** — allow it inbound on the host firewall, in the VPS
security group, or forward it on the router. With Radmin VPN / Hamachi use the
address of the virtual adapter. Check the game console and
`My Documents\My Games\Skyrim Special Edition\SKSE\SkyrimPlatform.log` for
details.
