# 直连联机（Direct Connect）

这个分支在 SkyMP 的基础上增加了「直连模式」：客户端不经过任何 master / gateway /
账号服务，玩家在游戏里按 **F2** 填写 `<房主IP>:端口号` 就能连接。局域网、Radmin VPN、
Hamachi、家宽端口转发、公网 VPS、Docker 都是同一套流程，因为对客户端来说它们只是
「一个能通的 IP 和端口」。

## 玩家怎么用

发布页有两个压缩包，各自内含中英双语 `README.md`：

* `skymp-client-*.zip` —— 客户端 mod，MO2 安装，SKSE 启动，F2 连接。
* `skymp-server-win-*.zip` —— Windows 服务器，放入 esm 后双击 `skymp-server.exe` 启动
  （运行时已内置，无需安装 Node.js；`start-server.bat` 等价）。

## 模式是怎么判定的

`SettingsService.isDirectConnectMode()`：

1. `Data/Platform/Plugins/skymp5-client-settings.txt` 里的 `directConnect` 为布尔值时按它；
2. 否则看 `master` 是否为空 —— 空则直连。

`OFFLINE_MODE=ON` 的构建会生成 `directConnect: true` 且 `master: ""`
（见 `cmake/scripts/generate_client_settings.cmake`），所以发布包默认就是直连模式。
把 `master` 填成网关地址即可回到上游的账号登录流程，两条路径共存。

## 客户端各部分的分工

| 文件 | 作用 |
| --- | --- |
| `services/services/connectMenuService.ts` | F2 界面本身：地址输入、连接/断开、状态显示、记住上次地址、生成本机身份 |
| `services/services/settingsService.ts` | `isDirectConnectMode()`、运行期地址覆盖 `setTargetPeerOverride()`、直连模式下的 manifest 获取 |
| `services/services/authService.ts` | 直连模式下让路，不做 Discord / master 流程 |
| `services/services/networkingService.ts` | 换地址时先销毁旧连接；重连改为指数退避（1s→10s） |
| `services/services/loadOrderVerificationService.ts` | 直连模式下等进入世界后再比对加载顺序 |

### 身份（profileId）

离线模式下服务器用 `profileId` 区分角色。如果所有客户端共用同一个写死的 id，
所有人就会共用同一个角色。因此客户端在首次连接时随机生成一个 int32 并保存在
`Data/Platform/PluginsNoLoad/connect-data-no-load.js`，重连回到同一个角色。
构建脚本也不再往发布包里写 `gameData.profileId`。

### 加载顺序校验

上游通过 master API 的 `/api/servers/<key>/manifest.json` 校验。直连模式下没有 master，
但服务器自己就有一个 HTTP 端口（`skymp5-server/ts/ui.ts`，端口为 7777→3000，其它端口为
`port + 1`）并把 `data/manifest.json` 静态提供出来，客户端直接向它请求。
拿不到时只在控制台记一行，不再弹红字——「拿不到」和「不匹配」是两件事，
`getServerMods()` 因此返回 `Mod[] | null`。

## SKSE 1.5.x 与 1.6.x

SkyrimPlatform 用 CommonLibSSE-NG（flatrim）构建，地址通过 Address Library 在运行时解析，
所以同一个 `SkyrimPlatform.dll` 在 SE 和 AE 上都能工作 —— 前提是对应的 Address Library
数据库存在。SE 的文件名是 `version-1-5-*.bin`，AE 的是 `versionlib-1-6-*.bin`，
名字不冲突，可以同时放在 `Data/SKSE/Plugins` 里，CommonLibSSE 会挑与当前 exe 匹配的那个。

`client-deps/CMakeLists.txt` 原先按一个从未被任何 CMakeLists 定义过的 `SKYRIM_SE` 变量
二选一，结果 SE 玩家永远只拿到 AE 的数据库，SkyrimPlatform 无法初始化。现在默认
（`UNIFIED_CLIENT_DEPS=ON`）两套一起打包，一个客户端压缩包同时支持 1.5.x 和 1.6.x。

## 本地打包

```bash
mkdir build && cd build
cmake .. -DOFFLINE_MODE=ON -DBUILD_FRONT=ON -DBUILD_UNIT_TESTS=OFF
cmake --build . --config Release
cmake -DREPO_DIR=<repo> -DDIST_DIR=<repo>/build/dist \
      -DOUT_DIR=<repo>/build/release -DVERSION=dev \
      -P <repo>/cmake/scripts/make_release_archives.cmake
```

`BUILD_FRONT=ON` 现在默认用仓库内的 `skymp5-front` 源码构建（`BUILD_FRONT_FROM_LOCAL_SOURCES`），
不再需要私有仓库的 PAT。没有 UI 就没有 F2 界面，所以发布构建必须开启它。

CI 见 `.github/workflows/release.yml`：推 `v*` tag 会构建并把两个 zip 发到 Releases；
也可以手动触发只拿构建产物。发布构建关闭了单元测试（需要 Skyrim 数据文件），
测试仍由 `pr-windows-flatrim.yml` 等工作流负责。

## 与流畅性相关的改动

* 客户端 bundle 不再内联 source map（`skymp5-client/webpack.config.js`），
  每次启动/热重载少解析几 MB 文本。**故意不做混淆**：部分界面代码是把函数 `toString()`
  后按变量名注入上下文送进 CEF 的（`lib/functionInfo.ts`），服务查找也依赖构造函数名，
  重命名会在运行时炸掉。
* UI bundle（`skymp5-front`）改为 production 模式 —— 它不做上述字符串化，压缩是安全的。
* `disableFastTravelService` 原先每帧调用一次 `Game.enableFastTravel(false)` 原生函数，
  改为 5 秒重申一次，行为不变。
* `networkingService` 的重连退避避免了地址写错时的连接风暴。
