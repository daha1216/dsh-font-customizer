# dsh-pocket 备份与恢复（backup/）

本目录是 **dsh-pocket 插件「安装态 + 本地补丁」** 的快照。上游插件通过 pnpm 安装在
`~/.dsh/profiles/web/node_modules/dsh-pocket`（v2.10.3，锁定 `github:shaobeichen/dsh-pocket` tarball eb25503），
本地在其上打了手机端兼容补丁。**任何 pnpm 重装（包括市场自动更新其他插件引发的 relink）
都会把 node_modules 恢复成上游原样、清掉本地补丁** —— 曾发生三次（07 日 20:00 / 23:04、
08 日 02:23）。08 日起补丁已"写死"（见下文「写死机制」），pocket 理论上不会再被冲掉；
万一失效，本文路径 A + 重启仍是完整恢复手段。

## 内容

| 路径 | 说明 |
| --- | --- |
| `plugins/dsh-pocket/` | 打完补丁的完整插件目录（49 文件，845 KB），含 `lib/proxy.mjs`（401 自愈、手机诊断脚本注入、preservedQuery / handshake 刷新、forceLoopback）、`client/mobile/mobile-apply.tsx`（适配器）、`client/mobile/upstream/`（上游 dsh-web-mobile v2.3.0 镜像 25 文件）、`client/client.js`（已构建 bundle，移植层已打包在内；校验标记用 `POCKET_EXTRA_CSS` / `fileGuard`，`upstreamApply` 是标识符会被 esbuild 改名、在 bundle 里查不到）、`PORTING.md` |
| `patches/` | 24 个补丁步骤 JSON（seq-454 → seq-2563，从会话转录 `session.v2.jsonl.zstd` 恢复的 write/edit 原文），供 `replay-patches.mjs` 重放 |
| `tools/dsh-pocket/` | 9 个维护脚本：`apply-rc1-mobile-compat.ps1`（rc.1 loopback 补丁）、`sync-dsh-web-mobile.mjs`（upstream 镜像 + esbuild 重建）、`detached-restart.cjs`（25s 熔断重启）、`detached-install-restart.cjs`（杀 web → install → 重启）、`detached-patch-orchestrator.cjs`（补丁重生成编排）、`auto-restore.mjs`（postinstall 自愈）、`apply-pin-patch.ps1`、`patch-native-tostring.mjs`、`ssl-recovery-watch.mjs` |
| `tools/restore/` | 补丁重放工具链：`replay-patches.mjs`、`dump-zstd.mjs`（多帧 zstd 转录解压）、`extract-patches.mjs` |
| `profile/` | 重装 pocket 所需的 4 个 profile 文件：`package.json`（含 postinstall 自愈）、`pnpm-lock.yaml`、`pnpm-workspace.yaml`（含 patchedDependencies 登记）、`.npmrc`；另有 `patches/` 子目录（写死补丁本体：`dsh-pocket@2.10.3.patch` + `@xueayi__dsh-opencode-go-usage@0.1.6.patch`） |
| `MANIFEST.json` | 快照清单 + 补丁标记核验（`patched` 下应全为 `true`） |

敏感文件**从不**入库：`restart-and-setpin.ps1`（明文 PIN）、`cloudflare-api.md`（隧道 token）、
`.credentials.yaml`、`token*`、`*.log`、`*.bak`、dsh-pet `assets/`（57MB 上游媒体）。

## 恢复步骤（wipe 后）

### 路径 A：直接拷回（pocket 版本未变时最快）

```powershell
$dst = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-pocket"
Copy-Item backup\plugins\dsh-pocket\* $dst -Recurse -Force
```

注意：用合并拷贝（Copy-Item），**不要** robocopy `/MIR` —— 会把 dest 里的嵌套
`node_modules` junction 删掉。构建产物 bundle 在备份里（`client/client.js`），无需重建；
若想按最新上游重建，跑一次 `sync-dsh-web-mobile.mjs` 即可。拷完重启 dsh web（见下）。

### 路径 B：重放补丁（上游版本变了 / 想逐步走）

1. rc.1 loopback 补丁（必须在重放之前，当晚验证过的顺序）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File backup\tools\dsh-pocket\apply-rc1-mobile-compat.ps1
   ```
2. 补丁重放（先 dry 校验锚点，全 `match=1` 再 apply）：
   ```sh
   node backup/tools/restore/replay-patches.mjs backup/patches dry
   node backup/tools/restore/replay-patches.mjs backup/patches apply
   ```
3. （可选）upstream 镜像重建：`node backup/tools/dsh-pocket/sync-dsh-web-mobile.mjs`
   —— 路径 B 在上游版本推进后用它重新镜像 + 重建 bundle。
4. 校验：`node --check lib/proxy.mjs`，并核对 `MANIFEST.json` 补丁标记全 `true`。
5. 重启 dsh web。

### 重启

```sh
node "%USERPROFILE%\.dsh\dsh-pocket\detached-restart.cjs"
```

25s 熔断后杀 3080 监听进程并拉起新实例（会断当前会话，转录落盘可恢复）。

## 写死机制（2026-09-08 起启用）

- **pnpm patchedDependencies**：`profile/pnpm-workspace.yaml` 登记
  `dsh-pocket@2.10.3 -> patches/dsh-pocket@2.10.3.patch`（610KB，纯新增+修改、零删除条目）。
  任何 pnpm install（含市场更新引发的全量 relink）都会自动把全部定制打回：
  `lib/proxy.mjs` 补丁、mobile 适配器、`client/client.js` 已构建 bundle、`upstream/` 镜像、`PORTING.md`。
- **postinstall 自愈**：`profile/package.json` 的 `postinstall -> auto-restore.mjs`
  在每次 install 后重注入 dsh-pet 手机守卫，并在 pocket 意外失补（版本一致时）从备份快照整体拷回。
  永远 exit 0（失败不能阻断安装），日志 `~/.dsh/dsh-pocket/auto-restore.log`。
- **重生成补丁**（pocket 版本升级时）：跑 `tools/dsh-pocket/detached-patch-orchestrator.cjs`
  —— 分离执行：杀 web → install 洗 lockfile → `pnpm patch` 抽纯净 staging → 备份覆盖 →
  `pnpm patch-commit` → 校验标记 → 拉起 web。三个必须知道的坑：
  1. 补丁**不能含删除条目**——pnpm 12 应用器会报 `delete patch left ... non-empty`；
     退役文件（MobileNavToggle 等 6 个）保留为死代码即可，适配器不引用它们。
  2. staging 必须是纯净 29 文件：lockfile 里残留 patched 记录时 `pnpm patch` 会抽出带补丁状态；
     先 `pnpm install` 洗掉（workspace.yaml 无 patchedDependencies 时自动净化 lockfile）。
  3. staging 目录残留会报 `ERR_PNPM_EDIT_DIR_NOT_EMPTY`，先清 `node_modules/.pnpm_patches`。
  另：pnpm 12 在安装计划变化时会全量重链 227 包，dsh web 运行时锁住
  `@electron-internal/extract-zip` 的 .node（os error 5）——install 必须在 web 停止时跑，
  detached-patch-orchestrator.cjs 已封装该顺序。

## 其他插件（不在本备份范围）

- **dsh-pet** 手机禁用守卫：已由 postinstall 自愈脚本（`auto-restore.mjs`）在每次 install 后
  自动重注入；手动重跑：`node ~/.dsh/skills/pet-mobile/scripts/set-mobile.mjs --disable --profile web`
- **@xueayi/dsh-opencode-go-usage** 浮动 dock 的手机端禁用（2026-09-08 起已写死）：
  `profile/pnpm-workspace.yaml` 登记
  `'@xueayi/dsh-opencode-go-usage@0.1.6' -> patches/@xueayi__dsh-opencode-go-usage@0.1.6.patch`，
  内容 = `lib/client.js` 的 isMobile 判定块（pointer: coarse + <768px）+ `apply()` 入口
  `if (isMobile()) return;`（纯修改、零删除条目）。守卫失效时手动重放：
  `pnpm patch '@xueayi/dsh-opencode-go-usage'` → 把带守卫的 `lib/client.js`
  （备份 MANIFEST 校验过的状态）覆盖进 staging → `pnpm patch-commit <staging>`，
  全程需 web 停机，可参考 `tools/dsh-pocket/detached-opencode-commit.cjs` 的封装顺序。

## 已知坑

- 市场日志是 UTC：`~/.dsh/profiles/web/.dsh-market/log.ndjson` 里的时间 +8 才是本地时间。
  2026-09-07 的两次 wipe 分别对应 `12:02Z`（dsh-all-usage 更新）与 `15:04Z`
  （dsh-better-reasoning-effort 更新，重装同 commit 也触发全量 relink）。
- pnpm reinstall 会重写与 tarball 内容不一致的文件、删除本地新增文件（`upstream/`、`PORTING.md`），
  但不动 `~/.dsh/dsh-pocket/`（工具箱）与 `~/.dsh/skills/`（技能脚本）。
- 会话转录恢复工具链：`dump-zstd.mjs`（多帧 zstd，按 magic `28 B5 2F FD` 逐帧解压）
  → `extract-patches.mjs`（筛 `tool/call` 里的 write/edit）→ `replay-patches.mjs`（锚点校验 + 重放）。
- 备份脚本用法：`node backup/backup-plugins.mjs`（全量）或 `node backup/backup-plugins.mjs dsh-pocket`（只备份 pocket）。
