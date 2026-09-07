// extract-patches.mjs — pull write/edit tool calls from session transcript dump, save full arguments.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const path = process.argv[2]
const outDir = process.argv[3]
mkdirSync(outDir, { recursive: true })
const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)

const hits = []
for (let i = 0; i < lines.length; i++) {
  const o = JSON.parse(lines[i])
  if (o.type !== 'tool/call') continue
  const name = o.data?.name
  if (!['write', 'edit', 'multiedit', 'write_file', 'edit_file'].includes(name)) continue
  let args
  try { args = JSON.parse(o.data.arguments) } catch { continue }
  const fp = args.file_path ?? args.path ?? ''
  if (/proxy\.mjs|mobile-apply|layout-mode|PORTING|build\.mjs|index\.jsx|mobile\.css|nav-targets|MobileNavOverlay|patch-native|sync-dsh-web-mobile|detach/i.test(fp)) {
    hits.push({ line: i + 1, seq: o.seq, time: new Date(o.time).toISOString(), tool: name, fp })
  }
}

console.log(`hits=${hits.length}`)
for (const h of hits) {
  console.log(`${h.line}\tseq=${h.seq}\t${h.time}\t${h.tool}\t${h.fp}`)
}
// save the full index
writeFileSync(`${outDir}/index.json`, JSON.stringify(hits, null, 1))
