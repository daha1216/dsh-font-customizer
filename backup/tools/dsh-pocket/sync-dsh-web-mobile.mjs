// sync-dsh-web-mobile.mjs — 把 dsh-web-mobile 上游更新同步进 dsh-pocket 的移植层。
//
// 用法：
//   node C:\Users\daha\.dsh\dsh-pocket\sync-dsh-web-mobile.mjs            # 同步 origin/main
//   node C:\Users\daha\.dsh\dsh-pocket\sync-dsh-web-mobile.mjs v2.3.0     # 同步指定 tag
//
// 做什么：
//   1. 在 upstream/dsh-web-mobile 克隆里 git fetch（可选 checkout 指定 ref）
//   2. 镜像 src/client/** → dsh-pocket/client/mobile/upstream/（整目录覆盖 + 删除多余）
//   3. 确保 esbuild 可用（vendor junction），跑 client/build.mjs 重建 bundle
//   4. node --check 产物
//   5. 打印后续步骤（重启 + 回归）
//
// 前提：上游克隆在 C:\Users\daha\.dsh\dsh-pocket\upstream\dsh-web-mobile（首次：
//   git clone https://github.com/mexiaosqwq/dsh-web-mobile 该目录）
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const HOME = 'C:/Users/daha/.dsh/dsh-pocket'
const UPSTREAM_REPO = join(HOME, 'upstream/dsh-web-mobile')
const UPSTREAM_SRC = join(UPSTREAM_REPO, 'src/client')
const POCKET = 'C:/Users/daha/.dsh/profiles/web/node_modules/dsh-pocket'
const TARGET = join(POCKET, 'client/mobile/upstream')
const VENDOR = join(HOME, 'vendor/node_modules')

const ref = process.argv[2] ?? '' // 空 = origin/main

const log = (s) => console.log(s)
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'pipe' }).toString().trim()

// 1. fetch（+ 可选 checkout）
if (!existsSync(join(UPSTREAM_REPO, '.git'))) {
  console.error(`上游克隆不存在：${UPSTREAM_REPO}\n先：git clone https://github.com/mexiaosqwq/dsh-web-mobile "${UPSTREAM_REPO}"`)
  process.exit(1)
}
log(`[1/5] git fetch origin ...`)
run('git fetch origin --tags', UPSTREAM_REPO)
if (ref) {
  log(`  checkout ${ref}`)
  run(`git checkout ${ref}`, UPSTREAM_REPO)
} else {
  run('git checkout main', UPSTREAM_REPO)
  run('git reset --hard origin/main', UPSTREAM_REPO)
}
const commit = run('git rev-parse --short HEAD', UPSTREAM_REPO)
const ver = JSON.parse(run('git show HEAD:package.json', UPSTREAM_REPO)).version
log(`  上游版本：v${ver} (${commit})`)

// 2. 镜像 src/client → upstream/
log(`[2/5] 镜像 src/client/** → client/mobile/upstream/`)
rmSync(TARGET, { recursive: true, force: true })
mkdirSync(TARGET, { recursive: true })
cpSync(UPSTREAM_SRC, TARGET, { recursive: true })
const count = (() => {
  let n = 0
  const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : n++ } }
  walk(TARGET); return n
})()
log(`  复制 ${count} 个文件`)

// 3. esbuild junction + 构建
log(`[3/5] 确保 esbuild 可用并重建 bundle`)
const nm = join(POCKET, 'node_modules')
mkdirSync(join(nm, '@esbuild'), { recursive: true })
const link = (from, to) => { if (!existsSync(from)) execSync(`cmd /c mklink /J "${from}" "${to}"`) }
link(join(nm, 'esbuild'), join(VENDOR, 'esbuild'))
link(join(nm, '@esbuild/win32-x64'), join(VENDOR, '@esbuild/win32-x64'))

// 4. 构建 + 语法校验
run(`node "${join(POCKET, 'client/build.mjs')}"`, POCKET)
log(`[4/5] node --check 产物`)
run(`node --check "${join(POCKET, 'client/client.js')}"`, POCKET)
log(`  语法 OK`)

// 5. 后续步骤提醒
log(`[5/5] 同步完成。生效还需：`)
log(`  a. 重启 dsh web：node ${HOME}/detached-restart.cjs 之前先确认可重启（会断当前会话）`)
log(`     或等本回合结束后执行`)
log(`  b. WebKit 回归：登录 → 开会话 → 抽屉 → 滑动手势（探针脚本在 %TEMP%）`)
log(`  c. 若上游改了 slots/inject 结构，检查 client/mobile/mobile-apply.tsx 适配器注释`)
