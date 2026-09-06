# 工作进展 / MEMORY

> 本文件是会话交接备忘。新会话请先读本文件，再继续。
> 仓库：`/home/sj/桌面/skyfmp`（SkyMP fork，remote `komAAmok/skyfmp`），分支 `main`。
> 开始日期：2026-09-06。**所有改动均未提交**（会话开始时 git status 为 clean）。

## 一、任务目标

把这个 Skyrim 联机 mod 改造成：

1. 可通过 **MO2** 安装，通过 **SKSE** 启动；
2. 同时支持 **SKSE 1.5.x（SE）和 1.6.x（AE）**；
3. **不依赖 Steam**、不依赖账号/登录/网关服务；
4. 支持任意组网：局域网、Radmin LAN、Hamachi、公网 VPS/Docker；
5. 进游戏按 **F2** 呼出联机界面，填 `<房主IP>:端口号` 连接；
6. 用 GitHub Actions 编译出 **客户端 mod zip** 和 **服务器 zip**，可在 Releases 直接下载；
7. 保证游戏主体与 mod 的稳定性、流畅性。

## 二、关键决策与约束（改代码前必读）

这些是踩过/查证过的坑，违反会在运行时炸掉：

1. **`lookupListener()` 绝对不能在 service 构造函数里调用。**
   `SpApiInteractor.setup()`（`skymp5-client/src/services/spApiInteractor.ts`）是在**所有**
   service 构造完毕后才注册 listener 的，构造函数里查找会抛异常。
   正确做法：构造函数里注册两个事件入口，在 handler 内部再判断当前模式。

2. **客户端 bundle 绝对不能混淆/压缩。**
   部分 widget 是把函数 `toString()` 后按变量名注入上下文送进 CEF 的
   （`skymp5-client/src/lib/functionInfo.ts`），service 查找又依赖构造函数名。
   改名会在运行时失效。`skymp5-front` 的 bundle **可以**压缩，它没有这个机制。

3. **UI widget 的 element 数量必须跨刷新保持恒定。**
   否则 React 侧会重建组件，地址输入框里玩家打的字会丢。所以 status 固定为两行
   （`browserState.statusLines`），断开按钮用 `isDisabled` 而不是增删元素。

4. **Address Library 双版本可以共存。**
   SE 的文件名是 `version-1-5-*.bin`，AE 是 `versionlib-1-6-*.bin`，名字不冲突，
   同时放进 `Data/SKSE/Plugins` 即可，CommonLibSSE 会挑匹配当前 exe 的那个。
   这是"一个客户端 zip 通吃 1.5.x + 1.6.x"的原理。

5. **直连模式下 manifest 来自游戏服务器自己的 HTTP 端口**，不是 master API。
   端口规则：游戏端口 7777 → HTTP 3000，其它端口 → `port + 1`
   （见 `skymp5-server/ts/ui.ts` 的 `uiPort`，改动时两边要同步）。

6. **模式开关**：`SettingsService.isDirectConnectMode()` —— 先看
   `skymp5-client-settings.txt` 里的 `directConnect` 布尔值，没有则看 `master` 是否为空。
   上游的 Discord/master 登录路径**完整保留**，两条路径并存。

## 三、已完成的改动

### 3.1 修掉两个阻断 1.5.x 的 bug

| 文件 | 问题 | 修法 |
| --- | --- | --- |
| `client-deps/CMakeLists.txt` | 按 `SKYRIM_SE` 变量在 SE/AE 的 Address Library 间二选一，但**该变量从未被任何 CMakeLists 定义**，导致 SE 玩家永远只拿到 AE 数据库，SkyrimPlatform 无法初始化 | 重写：新增 `UNIFIED_CLIENT_DEPS`（默认 ON），两套一起打包 |
| `skyrim-platform/src/platform_se/skyrim_platform/BrowserApi.cpp` | `case Backend::kOff` 缺 `break`，穿透到 `kTilted` 并用真实现覆盖刚注册的空实现 —— 配置里关掉浏览器实际关不掉 | 补 `break;` |

### 3.2 直连联机（新功能）

- **`skymp5-client/src/services/services/connectMenuService.ts`（新文件）**
  F2 界面本体：地址输入 / 连接 / 断开 / 状态显示 / 记住上次地址 / 生成本机身份。
  中英俄三语（读 `Data/Platform/Distribution/locale`）。
  `parseAddress()` 接受裸 IP（默认端口 7777）、`host:port`、`[IPv6]:port`，
  非法输入直接提示而非静默拨号。
- **`settingsService.ts`**：新增 `isDirectConnectMode()`、`getTargetPeerOverride()` /
  `setTargetPeerOverride()`（运行期地址覆盖，会清 `targetPeerCache`）、
  `getConfiguredPeer()`、`getServerHttpUrl()`、`getServerModsDirect()`；
  `getServerMods()` 返回类型改为 **`Mod[] | null`**；
  `getTargetPeer()` 现在返回 `this.targetPeerCache`（直连是同步 resolve 的，
  原先固定返回 null 会让 `serverJsVerificationService` 误报 "target peer not ready"）。
- **`authService.ts`**：`onAuthNeeded` / `onBrowserWindowLoaded` /
  `handleConnectionDenied` / `onTick` 在直连模式下让路，不跑 Discord/master 流程。
- **`browserService.ts`**：直连模式下 F2 不再切换 overlay 可见性（交给联机界面）。
- **`loadOrderVerificationService.ts`**：直连模式改为**进入世界后**（`createActorMessage`
  且 `isMe`）再校验；`serverMods === null` 时只在控制台记一行，不弹红字
  ——「取不到」和「不匹配」是两件事。
- **`profileId`**：改为每台机器首次连接时随机生成 int32 并持久化到
  `Data/Platform/PluginsNoLoad/connect-data-no-load.js`。
  原先构建脚本往发布包写死 `profileId: 1`，**所有玩家会共用同一个角色**。
- **`index.ts`**：注册 `ConnectMenuService`。

### 3.3 稳定性 / 流畅性

- **`networkingService.ts`**：换地址时先 `destroyClient()`；重连改为**指数退避 1s→10s**
  （原先每次失败立刻重试，地址写错就是连接风暴）；`close()` 会取消待执行的重连；
  `scheduleReconnect()` 在地址为空时直接返回（否则每帧刷错误日志）。
- **`skympClient.ts`**：`setupHooks()` 加 `hooksInstalled` 幂等保护；
  `authAttempt` 监听移出条件分支 —— 原先只在 storage 为空时注册，
  导致直连模式下**第二次连接是空操作**。
- **`disableFastTravelService.ts`**：从每帧一次 `Game.enableFastTravel(false)` 原生调用
  改为 5 秒重申一次（行为不变，省掉 ~99% 的 Papyrus native 调用）。
- **`skymp5-client/webpack.config.js`**：production 模式、去掉内联 source map，
  但**显式 `minimize: false` / `concatenateModules: false` / `mangleExports: false`**
  （原因见「关键决策」第 2 条）。`SKYMP_DEV_BUILD=true` 回到 dev 模式。
- **`skymp5-front/webpack.config.ts`**：非 dev 构建走 production（这个可以压缩）。

### 3.4 打包与发布

- **`skymp5-front/CMakeLists.txt`**：新增 `BUILD_FRONT_FROM_LOCAL_SOURCES`（默认 ON），
  用仓库内源码构建，**不再需要私有仓库 PAT**。没有 UI 就没有 F2 界面，所以发布构建必须开 `BUILD_FRONT=ON`。
- **`cmake/scripts/generate_client_settings.cmake`**：新增 DIRECT_CONNECT 分支
  （默认跟随 `OFFLINE_MODE`），写出 `directConnect: true`、`master: ""`、
  `server-info-ignore: true`、`autoConnect: false`，并**移除** `gameData.profileId`。
- **`cmake/scripts/generate_server_settings.cmake`**：离线模式下写 `listenHost: ""`（监听所有网卡）。
- **`cmake/scripts/make_release_archives.cmake`（新）**：从 `build/dist` 组装两个 zip。
  客户端 zip 的**根目录就是 `Data` 的内容**（MO2 无需手动 set as data directory），
  剔除 `plugin-example`、`PluginsNoLoad`、`*.pdb`。
- **`.github/workflows/release.yml`（新）**：推 `v*` tag 触发（也可手动跑只拿 artifact）。
  vcpkg 搬到 `C:/vcpkg`（根 CMakeLists 在 CI 下期望这个路径），构建后**校验关键产物存在**，
  再打包 + 发 Release。发布构建关掉单元测试（需要 Skyrim 数据文件），测试仍由
  `pr-windows-flatrim.yml` 负责。
- **`misc/release/`（新）**：客户端 README（中英）、服务器 README（中英）、
  `server-settings.json` 模板、`gamemode.js`、`start-server.bat`、`docker-compose.yml`、
  `data/PUT-SKYRIM-ESM-FILES-HERE.txt`、`RELEASE_NOTES.md`。
- **`docs/direct_connect.md`（新）** + `README.md` 加了一节。

## 四、验证状态（重要，别夸大）

**已验证：**
- `cd skymp5-client && npx tsc --noEmit -p tsconfig.json` → EXIT=0
- `yarn build` 成功，产物 `build/dist/client/Data/Platform/Plugins/skymp5-client.js`
- 已 dump 生成的 `widgetSetter` 函数文本，确认标识符未被改名（CEF 注入机制仍可用）

**未验证：**
- **最后三处改动没有跑过 typecheck**（会话末尾 Bash 工具持续不可用）：
  `networkingService.scheduleReconnect()` 的空地址保护、`connectMenuService.connect()`
  的「已连接」分支、`connectMenuService.readData()` 的类型断言。
- **C++/CMake 侧完全没有编译验证** —— 本机没装 cmake，且 SkyrimPlatform 是
  Windows/MSVC 专属（CommonLibSSE、CEF、frida-gum）。`BrowserApi.cpp` 和
  `client-deps/CMakeLists.txt` 的改动是**审查过但未编译**的。
- `skymp5-front` 的构建（`yarn install` 被中断）。
- 游戏内 F2 实际流程（需要 Windows + Skyrim + SKSE）。
- `make_release_archives.cmake` 和 `release.yml` 从未执行过。

## 五、待办（按优先级）

1. **补跑客户端验证**（新会话第一件事）：
   ```bash
   cd /home/sj/桌面/skyfmp/skymp5-client && npx tsc --noEmit -p tsconfig.json && yarn build
   ```
2. **验证 front 能构建**：
   ```bash
   cd /home/sj/桌面/skyfmp/skymp5-front && yarn install && yarn build
   ```
   （`config.js` 是 gitignore 的，构建前需要写入 `outputPath`；CMakeLists 会自动生成）
3. **确认 F2 事件链路正确**：`queryKeyCodeBindings` 由 `keyboardEventsService.ts` 通过
   `controller.emitter.emit` 发出，`connectMenuService` 用 `emitter.on` 订阅 —— 已按此实现，
   但没有运行时验证。`browserMessage` 是 `controller.on`（SP 原生事件），也已按此订阅。
4. **确认 front 的 `inputText` 支持 `onInput` 回调**：`skymp5-front/src/constructor.js`
   把 `inputText` 映射到 `SkyrimInput` 并传 `onInput`，看起来可用，但未实测；
   widget id 用了 3（AuthService 用 1 和 2，避免冲突）。
5. **跑一次 CI**：推 tag 或手动触发 `release.yml`，这是 C++/CMake/打包的首次真实验证。
   预期会有需要迭代的地方（vcpkg 缓存、产物路径、`upload-artifact` 版本等）。
6. **提交改动**（用户未要求提交，需先确认）。目前全部未提交。
7. **端到端实测**：Windows 上装 MO2 + SKSE，两台机器（或 Radmin VPN）实际联机。

## 六、有用的上下文

- **2026-09-06 更新（已提交并推送）**：按用户要求移除了 Linux 和 Skyrim VR 支持，
  并修复了 GitHub Actions 的失败。删除的 workflow：`pr-linux-variants.yml`、
  `linux-build-base.yml`、`build-docker-images.yml`（Linux CI）、
  `pr-windows-skyrimvr.yml`（VR）、`trigger-installer.yml`（需要上游组织 PAT，
  每次 push 必失败）。同时删除了仅被它们引用的 `Dockerfile`、`.dockerignore`、
  `misc/github_env_linux`、`misc/deps_linux/`、`.devcontainer/`，并更新了
  CONTRIBUTING.md 中对应的 Docker 镜像说明。`pr-windows-flatrim.yml` 重写为
  自包含的 Windows 编译检查（不再用 `pr_base` action，改用与 `release.yml`
  相同的配置，vcpkg 缓存用 `x-gha`）。**最终三个检查（Flatrim 编译、
  Prettier、Formatting）在 713ff1d 全部通过。**
  服务器仍可在 Linux VPS 上跑（`build.sh` + `misc/release/server/docker-compose.yml`，
  用的是官方 node 镜像，与删除的 Dockerfile 无关）。
- **CI 坑（重要）**：Windows 上把 vcpkg 挪到 `C:\vcpkg` 的步骤里，`robocopy`
  成功时退出码是 **1**，pwsh 会把 `$LASTEXITCODE` 当作脚本进程退出码，
  导致步骤"无错误输出但退出码 1"而失败。修复：脚本末尾显式 `exit 0`，
  并设 `$ErrorActionPreference='Stop'`（真错误会抛出可见异常）。
  两处相同的步骤（`pr-windows-flatrim.yml` 和 `release.yml`）都加了。
  另外 runner 会被复用，`C:\vcpkg` 可能残留上一轮副本，删除失败无碍
  （robocopy /E 是合并复制），已做成 best-effort。

- 构建命令（见 `CLAUDE.md`）：必须在 `build/` 目录里跑 `cmake --build .`；
  测试 `ctest --verbose`；单个测试 `./unit/unit [Tag]`。
- 本地打包发布 zip：
  ```bash
  mkdir build && cd build
  cmake .. -DOFFLINE_MODE=ON -DBUILD_FRONT=ON -DBUILD_UNIT_TESTS=OFF
  cmake --build . --config Release
  cmake -DREPO_DIR=<repo> -DDIST_DIR=<repo>/build/dist \
        -DOUT_DIR=<repo>/build/release -DVERSION=dev \
        -P <repo>/cmake/scripts/make_release_archives.cmake
  ```
- 协议版本在 `skymp5-server/cpp/mp_common/Config.h` 的 `kMessagingProtocolVersion`，
  被当作 SLikeNet 密码前缀用于拒绝版本不匹配的客户端 —— 客户端看到的是
  "invalid password"，直连界面把它翻译成"房主使用的 mod 版本与你不一致"。
- 服务器房间密码：`server-settings.json` 加 `"password"`，客户端放
  `Data/Platform/Distribution/password`（见 `MpClientPlugin.cpp:16`）。
