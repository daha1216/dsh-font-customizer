# dsh-pocket 备份与恢复（backup/）

本目录是 **dsh-pocket 插件「安装态 + 本地补丁」** 的快照。上游插件通过 pnpm 安装在
`~/.dsh/profiles/web/node_modules/dsh-pocket`（v2.10.3，锁定 `github:shaobeichen/dsh-pocket` tarball eb25503），
本地在其上打了手机端兼容补丁。**任何 pnpm 重装（包括市场自动更新其他插件引发的 relink）
都会把 node_modules 恢复成上游原样、清掉本地补丁** —— 已发生三次（07 日 20:00 / 23:04、
08 日 02:23）。第三次已用本文路径 A + 重启在几分钟内恢复，流程可用。

## 内容

| 路径 | 说明 |
| --- | --- |
| `plugins/dsh-pocket/` | 打完补丁的完整插件目录（49 文件，845 KB），含 `lib/proxy.mjs`（401 自愈、手机诊断脚本注入、preservedQuery / handshake 刷新、forceLoopback）、`client/mobile/mobile-apply.tsx`（适配器）、`client/mobile/upstream/`（上游 dsh-web-mobile v2.3.0 镜像 25 文件）、`client/client.js`（已构建 bundle，移植层已打包在内；校验标记用 `POCKET_EXTRA_CSS` / `fileGuard`，`upstreamApply` 是标识符会被 esbuild 改名、在 bundle 里查不到）、`PORTING.md` |
| `patches/` | 24 个补丁步骤 JSON（seq-454 → seq-2563，从会话转录 `session.v2.jsonl.zstd` 恢复的 write/edit 原文），供 `replay-patches.mjs` 重放 |
| `tools/dsh-pocket/` | 6 个维护脚本：`apply-rc1-mobile-compat.ps1`（rc.1 loopback 补丁）、`sync-dsh-web-mobile.mjs`（upstream 镜像 + esbuild 重建）、`detached-restart.cjs`（25s 熔断重启）、`apply-pin-patch.ps1`、`patch-native-tostring.mjs`、`ssl-recovery-watch.mjs` |
| `tools/restore/` | 补丁重放工具链：`replay-patches.mjs`、`dump-zstd.mjs`（多帧 zstd 转录解压）、`extract-patches.mjs` |
| `profile/` | 重装 pocket 所需的 4 个 profile 文件：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.npmrc` |
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

## 其他插件（不在本备份范围）

- **dsh-pet** 手机禁用守卫（wipe 后重跑一次）：
  `node ~/.dsh/skills/pet-mobile/scripts/set-mobile.mjs --disable --profile web`
- **@xueayi/dsh-opencode-go-usage** 浮动 dock 的手机端禁用：未纳入备份（原 edit 需从
  会话转录 `seq 583/593/595` 恢复，锚点在 23:04 wipe 后的版本上不再匹配）。

## 已知坑

- 市场日志是 UTC：`~/.dsh/profiles/web/.dsh-market/log.ndjson` 里的时间 +8 才是本地时间。
  2026-09-07 的两次 wipe 分别对应 `12:02Z`（dsh-all-usage 更新）与 `15:04Z`
  （dsh-better-reasoning-effort 更新，重装同 commit 也触发全量 relink）。
- pnpm reinstall 会重写与 tarball 内容不一致的文件、删除本地新增文件（`upstream/`、`PORTING.md`），
  但不动 `~/.dsh/dsh-pocket/`（工具箱）与 `~/.dsh/skills/`（技能脚本）。
- 会话转录恢复工具链：`dump-zstd.mjs`（多帧 zstd，按 magic `28 B5 2F FD` 逐帧解压）
  → `extract-patches.mjs`（筛 `tool/call` 里的 write/edit）→ `replay-patches.mjs`（锚点校验 + 重放）。
- 备份脚本用法：`node backup/backup-plugins.mjs`（全量）或 `node backup/backup-plugins.mjs dsh-pocket`（只备份 pocket）。
