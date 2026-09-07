// backup-plugins.mjs — snapshot installed DSH plugins (with local patches) into this repo.
//
// Why: plugin updates / pnpm reinstalls wipe local patches from
// ~/.dsh/profiles/web/node_modules (happened 2026-09-07). This script mirrors
// the installed+patched state into <repo>/backup/ so a wipe is recoverable.
//
// Usage:  node backup/backup-plugins.mjs
// Source: DSH_HOME (default ~/.dsh), profile "web".
//
// Exclusions:
//   - nested node_modules/ (junctions; restored by sync-dsh-web-mobile.mjs)
//   - *.bak (regenerable rollback copies)
//   - symlinks/junctions (git cannot store them)
//   - dsh-pet assets/ (57MB upstream videos+fonts, unmodified — reinstall from npm)
//   - dsh-font-customizer (link: to this very repo)
//   - secrets: ~/.dsh/dsh-pocket/{settings.json,token*,*.log,cloudflare-api.md},
//     profile .credentials.yaml — NEVER backed up.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const backupDir = dirname(fileURLToPath(import.meta.url)) // <repo>/backup
const repoRoot = dirname(backupDir)
const dshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '.', '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')
const nm = join(profileDir, 'node_modules')

const ONLY = (process.argv[2] ?? '').replace(/^--only=/, '') || null // e.g. `node backup-plugins.mjs dsh-pocket`
const PROFILE_FILES = ONLY
  ? ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc'] // pocket-only: files that pin/reinstall dsh-pocket
  : ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.yml', 'cordis.patch.yml', 'settings.yaml', '.npmrc']
const TOOLBOX = ['apply-pin-patch.ps1', 'apply-rc1-mobile-compat.ps1', 'detached-restart.cjs', 'detached-install-restart.cjs', 'detached-patch-orchestrator.cjs', 'auto-restore.mjs', 'patch-native-tostring.mjs', 'ssl-recovery-watch.mjs', 'sync-dsh-web-mobile.mjs']
// restart-and-setpin.ps1 故意不备份：内含明文 PIN。
const EXCLUDE_SUBDIRS = new Set(['node_modules'])
const EXCLUDE_BY_PKG = { 'dsh-pet': ['assets'] } // 57MB upstream assets, unmodified
const isBak = (name) => name.endsWith('.bak')

const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
const deps = pkg.dependencies ?? {}
const packages = Object.entries(deps)
  .filter(([name, spec]) => {
    if (String(spec).startsWith('link:')) { console.log(`skip ${name} (link: → ${spec})`); return false }
    if (!existsSync(join(nm, name))) { console.log(`WARN ${name} in package.json but missing in node_modules`); return false }
    return true
  })
  .map(([name]) => name)

// markers of local patches, recorded in MANIFEST for future restores
const PATCH_MARKERS = {
  'dsh-pocket': { 'lib/proxy.mjs': ['PHONE_DIAG_SCRIPT', 'preservedQuery', 'DEFAULT_INJECT_WITH_DIAG', 'forceLoopback', 'RANDOM_UUID_POLYFILL'], 'client/mobile/mobile-apply.tsx': ['upstreamApply'], 'client/client.js': ['POCKET_EXTRA_CSS', 'fileGuard'] },
  'dsh-pet': { 'lib/client.js': ['isMobile'] },
  '@xueayi/dsh-opencode-go-usage': { 'lib/client.js': ['isMobile'] },
}

function copyPkg(name) {
  const src = join(nm, name)
  const dest = join(backupDir, 'plugins', name)
  rmSync(dest, { recursive: true, force: true })
  const extra = new Set(EXCLUDE_BY_PKG[name] ?? [])
  const skippedLinks = []
  let files = 0, bytes = 0
  cpSync(src, dest, {
    recursive: true,
    filter: (s) => {
      const rel = relative(src, s)
      if (!rel) return true
      const base = rel.split(/[\\/]/)[0]
      if (EXCLUDE_SUBDIRS.has(base) || extra.has(base)) return false
      let st
      try { st = lstatSync(s) } catch { return false }
      if (st.isSymbolicLink()) { skippedLinks.push(rel); return false }
      if (st.isFile() && isBak(s)) return false
      return true
    },
  })
  // measure
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else { files++; bytes += statSync(p).size }
    }
  }
  walk(dest)
  if (skippedLinks.length) console.log(`  ${name}: skipped links → ${skippedLinks.join(', ')}`)
  return { files, bytes }
}

// ---- plugins ----
const selected = ONLY ? packages.filter((n) => n === ONLY) : packages
if (ONLY && !selected.length) { console.error(`package not found: ${ONLY}`); process.exit(1) }
if (ONLY) rmSync(join(backupDir, 'plugins'), { recursive: true, force: true }) // only-mode replaces the previous snapshot
mkdirSync(join(backupDir, 'plugins'), { recursive: true })
const manifest = { time: new Date().toISOString(), source: profileDir, only: ONLY, packages: {}, patched: {} }
for (const name of selected) {
  const { files, bytes } = copyPkg(name)
  const version = JSON.parse(readFileSync(join(nm, name, 'package.json'), 'utf8')).version
  manifest.packages[name] = { version, spec: deps[name], files, bytes }
  const markers = PATCH_MARKERS[name]
  if (markers) {
    manifest.patched[name] = {}
    for (const [f, keys] of Object.entries(markers)) {
      const text = readFileSync(join(nm, name, f), 'utf8')
      manifest.patched[name][f] = Object.fromEntries(keys.map((k) => [k, text.includes(k)]))
    }
  }
  console.log(`✓ ${name} @${version} — ${files} files, ${(bytes / 1024).toFixed(0)} KB`)
}

// ---- profile install definition ----
mkdirSync(join(backupDir, 'profile'), { recursive: true })
for (const f of PROFILE_FILES) {
  const src = join(profileDir, f)
  if (!existsSync(src)) { console.log(`skip profile file ${f} (missing)`); continue }
  cpSync(src, join(backupDir, 'profile', f))
}
console.log(`✓ profile install definition (${PROFILE_FILES.length} files)`)

// pnpm patchedDependencies live in <profile>/patches/ — the hard-wired patch artifact
const profPatches = join(profileDir, 'patches')
if (existsSync(profPatches)) {
  rmSync(join(backupDir, 'profile', 'patches'), { recursive: true, force: true })
  cpSync(profPatches, join(backupDir, 'profile', 'patches'), { recursive: true })
  console.log('✓ profile pnpm patches -> backup/profile/patches/')
}

// ---- pocket recovery toolbox (scripts only, no secrets) ----
mkdirSync(join(backupDir, 'tools', 'dsh-pocket'), { recursive: true })
for (const f of TOOLBOX) {
  const src = join(dshHome, 'dsh-pocket', f)
  if (!existsSync(src)) { console.log(`skip tool ${f} (missing)`); continue }
  cpSync(src, join(backupDir, 'tools', 'dsh-pocket', f))
}
console.log(`✓ pocket toolbox (${TOOLBOX.length} scripts)`)

// ---- patch replay materials (recovered from session transcript; lets a fresh pnpm install be re-patched) ----
const PATCH_SRC = process.env.PATCH_SRC ?? 'I:/glm工作区/tmp/patches'
if (existsSync(PATCH_SRC)) {
  rmSync(join(backupDir, 'patches'), { recursive: true, force: true })
  cpSync(PATCH_SRC, join(backupDir, 'patches'), { recursive: true })
  console.log('✓ patch replay materials → backup/patches/')
} else {
  console.log(`skip patches (missing ${PATCH_SRC})`)
}
mkdirSync(join(backupDir, 'tools', 'restore'), { recursive: true })
for (const f of ['replay-patches.mjs', 'dump-zstd.mjs', 'extract-patches.mjs']) {
  const src = join(process.env.PATCH_TOOL_SRC ?? 'I:/glm工作区/tmp', f)
  if (existsSync(src)) cpSync(src, join(backupDir, 'tools', 'restore', f))
}
console.log('✓ restore scripts → backup/tools/restore/')

writeFileSync(join(backupDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2))
const totalKB = Object.values(manifest.packages).reduce((a, p) => a + p.bytes, 0) / 1024
console.log(`\nDONE: ${selected.length} plugins, ${(totalKB / 1024).toFixed(1)} MB total → ${backupDir}`)
console.log('Commit & push to persist the snapshot.')
