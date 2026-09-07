// Patch: hasIntrinsicConstructor exact-string native toString check breaks JSC (Safari) / SpiderMonkey,
// whose native function toString is multi-line: "function Object() {\n    [native code]\n}".
// Fix: whitespace-normalize before comparing. V8 output unchanged by normalization.
import { readFileSync, writeFileSync } from 'node:fs'

const repo = 'C:/dsh/deepseek-harness'
const files = [
  // browser-served bundles (the ones Safari loads)
  'packages/api/session-controller/lib/client.js',
  'packages/client/connection/lib/client.js',
  'packages/client/ui-chat/lib/client.js',
  'packages/client/ui-trajectory/lib/client.js',
  // host-side compiled copies (Node/V8 today, patched for consistency)
  'packages/util/values/lib/index.js',
  'packages/util/values/lib/types/index.js',
  'packages/core/tools/lib/index.js',
  'packages/core/tools/lib/types/json-schema.js',
  'packages/extensions/cordis-host-runner/lib/index.js',
  'packages/extensions/cordis-host-runner/lib/types/guard.js',
  // sources (so a rebuild keeps the fix)
  'packages/util/values/src/index.ts',
  'packages/core/tools/src/json-schema.ts',
  'packages/extensions/cordis-host-runner/src/guard.ts',
]

const pattern = /Function\.prototype\.toString\.call\(constructor\) === `function \$\{name\}\(\) \{ \[native code\] \}`/g
const replacement = 'Function.prototype.toString.call(constructor).replace(/\\s+/g, \' \').trim() === `function ${name}() { [native code] }`'

let total = 0
for (const rel of files) {
  const path = `${repo}/${rel}`
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch (error) {
    console.log(`MISS  ${rel}: ${error.code}`)
    continue
  }
  const matches = content.match(pattern)
  if (!matches) {
    console.log(`ZERO  ${rel} (pattern not found)`)
    continue
  }
  const patched = content.replace(pattern, () => replacement)
  writeFileSync(path, patched)
  total += matches.length
  console.log(`OK    ${rel} (${matches.length} site)`)
}
console.log(`TOTAL patched sites: ${total}`)
