// dump-zstd.mjs — decompress a multi-frame appended .zstd file (session.v2.jsonl.zstd).
// Each append is its own zstd frame; scan every frame magic and decompress independently.
import { readFileSync, writeFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const src = process.argv[2]
const out = process.argv[3]
if (!src || !out) { console.error('usage: node dump-zstd.mjs <in.zstd> <out.txt>'); process.exit(1) }

const buf = readFileSync(src)
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const parts = []
let frames = 0
let failed = 0
let idx = 0
while (true) {
  const at = buf.indexOf(magic, idx)
  if (at < 0) break
  try {
    parts.push(zstdDecompressSync(buf.subarray(at)))
    frames++
  } catch {
    failed++
  }
  idx = at + 1
}
const all = Buffer.concat(parts)
writeFileSync(out, all)
console.log(`file=${src}`)
console.log(`bytes=${buf.length} frames=${frames} failedMagics=${failed} decompressed=${all.length}`)
