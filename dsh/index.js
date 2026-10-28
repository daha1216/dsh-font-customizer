// dsh-font-customizer —— 宿主半侧
//
// 职责只有一件事：配置持久化。注册 /dsh-font-customizer/config HTTP 路由
// （GET 读取 / PUT 保存），配置原子落盘到
// ${DSH_HOME:-~/.dsh}/dsh-font-customizer/config.json。
// 字体渲染全部在浏览器半侧（dsh/client.js）完成，宿主不碰任何样式。
//
// 零运行时依赖：只用 node:fs / node:os / node:path 内置模块。

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

const name = 'font-customizer'
const inject = ['webServer']

/** 路由前缀。带一个短随机段避免与其他插件撞名。 */
const ROUTE_PREFIX = '/dsh-font-customizer'
/** PUT body 上限（配置是三五个字段的小 JSON，64KB 绰绰有余）。 */
const MAX_BODY_BYTES = 64 * 1024

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function configDir() {
  return join(dshHome(), 'dsh-font-customizer')
}
function configPath() {
  return join(configDir(), 'config.json')
}

/** 配置默认值：空栈 = 跟随 DSH 内置字体；0 号 = 不接管字号。 */
const DEFAULTS = { uiStack: '', codeStack: '', fontSize: 0 }

/**
 * 白名单净化：只收 uiStack / codeStack（字符串，最长 2000）与
 * fontSize（12..17 整数，0 表示"不接管"）。任何其它字段静默丢弃。
 */
function sanitize(raw) {
  const out = { ...DEFAULTS }
  if (raw === null || typeof raw !== 'object') return out
  if (typeof raw.uiStack === 'string') out.uiStack = raw.uiStack.slice(0, 2000)
  if (typeof raw.codeStack === 'string') out.codeStack = raw.codeStack.slice(0, 2000)
  const n = Number(raw.fontSize)
  out.fontSize = Number.isInteger(n) && n >= 12 && n <= 17 ? n : 0
  return out
}

function readConfig() {
  try {
    return sanitize(JSON.parse(readFileSync(configPath(), 'utf8')))
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Windows 上 rename 覆盖一个正被其他进程持有的目标会返回 EPERM/EBUSY/EACCES。
 * 这类错误是瞬时的（对方只是刚打开又关闭），重试若干次即可；真错误照旧抛出。
 * 用 Atomics.wait 做同步小睡，避免自旋烧 CPU。
 */
const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4))
function sleepSync(ms) {
  Atomics.wait(SLEEP_BUFFER, 0, 0, ms)
}
function renameWithRetry(from, to, attempts = 25) {
  for (let i = 0; ; i++) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      const code = error && error.code
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!transient || i >= attempts - 1) throw error
      sleepSync(Math.min(2 + i * 2, 40))
    }
  }
}

/**
 * 原子写：先写临时文件再 rename，进程中断不会留下半截 JSON。
 *
 * 临时文件名必须唯一：固定用 `.tmp` 时，两个并发 PUT 会写同一个临时文件，
 * 后者的 rename 可能把前者只写了一半的内容换上去；读侧 JSON.parse 失败后
 * 静默回落 DEFAULTS，用户的字体设置就被无声重置了。
 */
function writeConfig(cfg) {
  const clean = sanitize(cfg)
  mkdirSync(configDir(), { recursive: true })
  const target = configPath()
  const tmp = `${target}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
  try {
    writeFileSync(tmp, JSON.stringify(clean, null, 2) + '\n', 'utf8')
    renameWithRetry(tmp, target)
  } catch (error) {
    try { unlinkSync(tmp) } catch { /* 临时文件可能根本没建成 */ }
    throw error
  }
  return clean
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let failed = false
    req.on('data', (chunk) => {
      if (failed) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        failed = true
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (err) => {
      if (!failed) reject(err)
    })
  })
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/**
 * 请求栅栏：与 dsh-skills-manager / dsh-update-checker 同一套防线——Host 必须是
 * loopback（浏览器里只有本机 dsh web 这一个来源），拒绝 cross-site fetch，带 Origin
 * 时必须与 Host 一致。没有它，用户访问的任意网页都能跨站 POST 改写字体配置
 * （no-cors/simple request 不需要预检，写入会直接发生），DNS rebinding 还能读。
 */
function assertTrustedRequest(req) {
  const reject = (msg) => {
    const err = new Error(msg)
    err.status = 403
    throw err
  }
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') reject('missing Host header')
  let hostUrl
  try { hostUrl = new URL(`http://${host}`) } catch { reject('invalid Host header') }
  if (hostUrl.username !== '' || hostUrl.password !== '' || hostUrl.pathname !== '/' || hostUrl.search !== '' || hostUrl.hash !== '') {
    reject('invalid Host header')
  }
  const hostname = hostUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const loopback = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
  if (!loopback) reject('config route only allows loopback hosts')
  if (String(req.headers['sec-fetch-site'] ?? '').toLowerCase() === 'cross-site') {
    reject('cross-site requests are refused')
  }
  const origin = req.headers.origin
  if (origin !== undefined) {
    let originUrl
    try { originUrl = new URL(origin) } catch { reject('invalid Origin header') }
    if (originUrl.host !== hostUrl.host) reject('Origin does not match Host')
  }
}

function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async (req, res) => {
          try {
            assertTrustedRequest(req)
            const url = new URL(req.url ?? '/', 'http://localhost')
            if (url.pathname === ROUTE_PREFIX + '/config') {
              if (req.method === 'GET') {
                sendJson(res, 200, readConfig())
                return
              }
              if (req.method === 'PUT' || req.method === 'POST') {
                const body = await readBody(req)
                let parsed
                try {
                  parsed = JSON.parse(body)
                } catch {
                  sendJson(res, 400, { error: 'request body is not valid JSON' })
                  return
                }
                sendJson(res, 200, writeConfig(parsed))
                return
              }
              sendJson(res, 405, { error: 'method not allowed' })
              return
            }
            sendJson(res, 404, { error: 'not found' })
          } catch (err) {
            sendJson(res, err?.status ?? 500, { error: err instanceof Error ? err.message : String(err) })
          }
        },
      }),
    'dsh-font-customizer: config route',
  )
}

export { apply, inject, name }
