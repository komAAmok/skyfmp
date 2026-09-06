# SkyMP

[![Discord Chat](https://img.shields.io/discord/699653182946803722?label=Discord&logo=Discord)](https://discord.gg/k39uQ9Yudt) 
[![PR's Welcome](https://img.shields.io/badge/PRs%20-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Players](https://skymp-badges.vercel.app/badges/players_online.svg)](https://discord.gg/k39uQ9Yudt) 
[![Servers](https://skymp-badges.vercel.app/badges/servers_online.svg)](https://discord.gg/k39uQ9Yudt)

SkyMP is an open-source multiplayer mod for Skyrim ⚡

SkyMP is built on top of the [SkyrimPlatform](docs/docs_skyrim_platform.md) - a tool to create Skyrim mods with TypeScript and Chromium. 🚀

This repo hosts all sources to ease local setup and contributing. See [CONTRIBUTING](CONTRIBUTING.md) for build instructions.

### 直连联机 / Direct connect

这个分支支持不经过任何账号或网关服务的直连联机：客户端用 Mod Organizer 2 安装、SKSE 启动，
进游戏按 **F2** 填写 `<房主IP>:端口号` 即可。同一个客户端压缩包同时支持 Skyrim SE 1.5.x 和
AE 1.6.x。做法与实现细节见 [docs/direct_connect.md](docs/direct_connect.md)。

Releases 页提供两个压缩包：客户端 mod（MO2 可直接安装）与 Windows 服务器。

### Terms of Use

See [TERMS.md](TERMS.md). TL;DR disclose the source code of your forks.

Third-party code licenses can be found in [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).

### Development with GitHub Codespaces

[![Create Codespace](https://img.shields.io/badge/Codespace-Launch-blue?logo=github)](https://github.com/codespaces/new?repo=skyrim-multiplayer/skymp&ref=main)
