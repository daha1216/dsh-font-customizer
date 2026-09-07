// auto-restore.mjs — postinstall self-heal for the DSH web profile.
// Wired as "postinstall" in the profile package.json. Runs after EVERY
// pnpm install (including dshmarket plugin updates) and re-applies the
// two local modifications that pnpm relinks would otherwise lose:
//   1. dsh-pocket mobile patches  — primary: pnpm patchedDependencies
//      (patches/dsh-pocket@2.10.3.patch). This script is the FALLBACK
//      (e.g. if an installer bypasses pnpm patch application).
//   2. dsh-pet mobile guard       — re-inject via the pet-mobile skill script.
// IMPORTANT: must ALWAYS exit 0 — a failing postinstall fails the whole install.
import { appendFileSync, cpSync, existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const HOME = process.env.USERPROFILE ?? 'C:/Users/daha'
const PROFILE = join(HOME, '.dsh', 'profiles', 'web')
const NM = join(PROFILE, 'node_modules')
const BACKUP = 'I:/glm\u5de5\u4f5c\u533a/dsh-font-customizer/backup/plugins/dsh-pocket'
const PET_SCRIPT = join(HOME, '.dsh', 'skills', 'pet-mobile', 'scripts', 'set-mobile.mjs')
const LOG = join(HOME, '.dsh', 'dsh-pocket', 'auto-restore.log')
const stamp = () => new Date().toISOString()
const logLine = (m) => { try { appendFileSync(LOG, `${stamp()} ${m}\n`) } catch {} }
function fileHas(p, s) { try { return readFileSync(p, 'utf8').includes(s) } catch { return false } }

// ---- 1. dsh-pocket fallback (only when version matches the backup snapshot) ----
try {
  const livePkg = join(NM, 'dsh-pocket', 'package.json')
  const bakPkg = join(BACKUP, 'package.json')
  if (existsSync(livePkg) && existsSync(bakPkg)) {
    const vLive = JSON.parse(readFileSync(livePkg, 'utf8')).version
    const vBak = JSON.parse(readFileSync(bakPkg, 'utf8')).version
    const proxy = join(NM, 'dsh-pocket', 'lib', 'proxy.mjs')
    const patched = fileHas(proxy, 'PHONE_DIAG_SCRIPT') && fileHas(proxy, 'forceLoopback')
    if (!patched && vLive === vBak) {
      cpSync(BACKUP, join(NM, 'dsh-pocket'), { recursive: true, force: true })
      logLine(`dsh-pocket was unpatched (v${vLive}) -> restored from backup snapshot`)
    } else {
      logLine(`dsh-pocket ok (patched=${patched}, live=v${vLive}, backup=v${vBak})`)
    }
  } else {
    logLine('dsh-pocket or backup snapshot missing - skipped')
  }
} catch (e) {
  logLine(`dsh-pocket step error (ignored): ${e && e.message}`)
}

// ---- 2. dsh-pet mobile guard ----
try {
  const petClient = join(NM, 'dsh-pet', 'lib', 'client.js')
  if (existsSync(petClient)) {
    if (fileHas(petClient, 'isMobile')) {
      logLine('dsh-pet guard present')
    } else if (existsSync(PET_SCRIPT)) {
      const r = spawnSync(process.execPath, [PET_SCRIPT, '--disable', '--profile', 'web'], { encoding: 'utf8', timeout: 60000 })
      logLine(`dsh-pet guard re-injected (exit=${r.status})`)
    } else {
      logLine('pet-mobile script missing - skipped')
    }
  } else {
    logLine('dsh-pet not installed - skipped')
  }
} catch (e) {
  logLine(`dsh-pet step error (ignored): ${e && e.message}`)
}

process.exit(0)
