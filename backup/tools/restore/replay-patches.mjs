// replay-patches.mjs — replay extracted write/edit tool calls onto live files.
// Usage: node replay-patches.mjs <patchesDir> <mode: dry|apply>
// Order: proxy.mjs edits by seq; mobile-apply.tsx write then edits; layout-mode.mjs edit; PORTING.md write.
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const mode = process.argv[3] ?? 'dry'
const files = readdirSync(dir).filter(f => /^seq-\d+-(write|edit)\.json$/.test(f))
const calls = files.map(f => JSON.parse(readFileSync(join(dir, f), 'utf8'))).sort((a, b) => a.seq - b.seq)

const TARGETS = {
  proxy: /node_modules[\\/]dsh-pocket[\\/]lib[\\/]proxy\.mjs$/,
  mobileApply: /node_modules[\\/]dsh-pocket[\\/]client[\\/]mobile[\\/]mobile-apply\.tsx$/,
  layoutMode: /node_modules[\\/]dsh-pocket[\\/]client[\\/]mobile[\\/]layout-mode\.mjs$/,
  porting: /node_modules[\\/]dsh-pocket[\\/]client[\\/]mobile[\\/]PORTING\.md$/,
}

const state = {} // target key -> current content (lazy loaded)
const load = (key, fp) => {
  if (!(key in state)) state[key] = readFileSync(fp, 'utf8')
  return state[key]
}

let failures = 0
for (const c of calls) {
  const fp = c.args.file_path
  let key = null
  for (const [k, re] of Object.entries(TARGETS)) if (re.test(fp)) { key = k; break }
  if (!key) { console.log(`SKIP seq=${c.seq} (not a target): ${fp}`); continue }

  if (c.tool === 'write') {
    console.log(`[${mode}] seq=${c.seq} WRITE ${key} (${c.args.content.length} bytes)`)
    if (mode === 'apply') state[key] = c.args.content
    else state[key] = c.args.content // dry-run still loads to chain edits
    continue
  }

  // edit
  let content = load(key, fp)
  const { old_string, new_string } = c.args
  const count = content.split(old_string).length - 1
  if (count === 0) {
    console.log(`FAIL seq=${c.seq} EDIT ${key}: old_string NOT FOUND (len=${old_string.length})`)
    failures++
    continue
  }
  if (count > 1 && !c.args.replace_all) {
    console.log(`FAIL seq=${c.seq} EDIT ${key}: old_string found ${count}x (need unique)`)
    failures++
    continue
  }
  console.log(`[${mode}] seq=${c.seq} EDIT ${key}: ok (match=${count}${c.args.replace_all ? ' replaceAll' : ''})`)
  state[key] = c.args.replace_all ? content.split(old_string).join(new_string) : content.replace(old_string, new_string)
}

if (failures > 0) { console.log(`\nABORT: ${failures} anchor failures — nothing written`); process.exit(1) }

if (mode === 'apply') {
  for (const c of calls) {
    const fp = c.args.file_path
    let key = null
    for (const [k, re] of Object.entries(TARGETS)) if (re.test(fp)) { key = k; break }
    if (!key) continue
    if (!(key in state)) continue
    const last = calls.filter(x => { let kk = null; for (const [k, re] of Object.entries(TARGETS)) if (re.test(x.args.file_path)) kk = k; return kk === key }).pop()
    if (last && c.seq !== last.seq) continue
    if (existsSync(fp)) copyFileSync(fp, `${fp}.pre-restore-20260908.bak`)
    else console.log(`(no backup — ${fp} did not exist)` )
    writeFileSync(fp, state[key])
    console.log(`WROTE ${fp} (${state[key].length} bytes, backup .pre-restore-20260908.bak)`)
  }
} else {
  console.log('\nDRY-RUN OK — all anchors match. Re-run with "apply" to write.')
}
