// dsh-pocket 移动端适配层：pocket 专属逻辑 + 整目录同步的 dsh-web-mobile 上游移植。
//
// 结构（详见 client/mobile/PORTING.md）：
//   upstream/          ← dsh-web-mobile src/client/** 原样镜像（sync 脚本整目录覆盖，勿手改）
//   mobile-apply.tsx   ← 本文件：pocket 适配器（布局门控 → 调上游 apply → pocket 附加层）
//   fileGuard.ts       ← pocket 专属（issue #17 文件链接守卫 + 复制）
//   layout-mode.mjs    ← pocket 专属（issue #74 ?dsh-layout= 强制布局）
//
// 上游负责：样式、词典、phone-chrome、reconciler 基建 + 7 任务（overlay backdrop+FAB、
// stats-line、git-chip、settings-toolbar、preview、sheet-rise）、侧栏滑动手势（v2.3 #16/#37）、
// 子代理芯片触控（v2.2）、抽屉点会话自动收起（v2.2 #32）、aionui 兼容、debug 徽章、
// 两个 slots（会话头 toggle + 抽屉底部 footer）。
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as upstreamApply } from './upstream/index.tsx'
import { startFileGuard } from './fileGuard.ts'
import { resolveLayout, persistLayoutFromUrl } from './layout-mode.mjs'
import { POCKET_RPC_CHANNEL, POCKET_ENDPOINTS } from '../api.js'

/** Pocket 专属样式补充——上游样式表无法携带的宿主事实（官方 DSH 无 aionui 套件等）。
 * 规则内容与旧 mobile.css.ts 中 issue #17 / #48 段落一致，从 v1.0.0 时代移植件继承。 */
const POCKET_EXTRA_CSS = `@media (max-width: 1023px) {
  /* ---------- 宿主没有 aionui explorer 列时隐藏「文件浏览」入口（issue #48） ----------
     官方 DeepSeek Harness 不带 dsh-web-ui；explorer 列存在与否由下方探测 effect
     标到 frame 上（data-mobile-nav-explorer）。没有列时这两个入口点了没反应。 */
  [data-mobile-nav-explorer="0"] [data-mobile-nav="files"],
  [data-mobile-nav-explorer="0"] [data-mobile-nav="explorer"] {
    display: none !important;
  }

  /* ---------- 隐藏「添加工作区」入口（issue #17 修正：手机上配工作区无意义） ----------
     图标按钮的 aria-label 随语言变化，两种都覆盖；下拉菜单里的文本项由
     fileGuard.ts 的 MutationObserver 按文案兜底隐藏。 */
  button[aria-label="添加工作区"],
  button[aria-label="添加工作区…"],
  button[aria-label="Add workspace"],
  button[aria-label="Add workspace…"] {
    display: none !important;
  }

  /* ---------- 文件链接旁的「复制」按钮（issue #17：复制文件内容） ----------
     由 fileGuard.ts 注入，这里兜底样式。 */
  [data-mobile-nav="copy-file"] {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    margin-left: 6px !important;
    vertical-align: baseline !important;
    height: 22px !important;
    padding: 0 8px !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .14)) !important;
    border-radius: 6px !important;
    background: var(--dsw-alias-bg-layer-1, #fff) !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
    font-family: inherit !important;
    font-size: 11px !important;
    line-height: 1 !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .12) !important;
  }
  [data-mobile-nav="copy-file"]:active {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06)) !important;
  }
  [data-mobile-nav="copy-file"][disabled] {
    opacity: .55 !important;
    cursor: default !important;
  }
}`

/**
 * Mobile-adaptive shell, pocket adapter half.
 * @param ctx - client root context.
 */
export function mobileApply(ctx: ClientContext): void {
  // 布局模式（issue #74）：URL 参数 > localStorage > auto(=matchMedia)。
  // desktop 模式（宽屏手机/平板强制电脑布局）下整段 mobile 效果都不挂——
  // 不加 styles、不挂 slots、不跑 effects，直接走 DSH 原生桌面 UI。
  // 注：上游 v2.3.0 起 mobile 效果与样式全部按 (max-width: 1023px) and
  // (pointer: coarse) 自门控，「强制 mobile」在桌面浏览器（鼠标指针）上
  // 只对 pocket 附加层生效，上游布局不再强制——见 PORTING.md「已知行为差异」。
  const urlRaw = new URL(window.location.href).searchParams.get('dsh-layout')
  const urlValue = urlRaw ?? ''
  const narrowMQ = window.matchMedia('(max-width: 1023px)');
  // 传原始值（含 null=URL 无此参数）：persistLayoutFromUrl 需要区分「无参数」
  // （不动 localStorage，issue #74 的持久化承诺）与「显式 dsh-layout=auto」（清除）。
  const stored = persistLayoutFromUrl(urlRaw);
  const layout = resolveLayout({ urlValue, stored, narrowMatch: narrowMQ.matches });
  document.body?.setAttribute('data-dsh-pocket-layout', layout);
  if (layout === 'desktop') return;
  // 强制 mobile：pocket 附加层（fileGuard、explorer 探测）永远挂；auto 模式
  // 挂载时按真实窄屏判断。
  let narrow: MediaQueryList = narrowMQ;
  if (layout === 'mobile') {
    narrow = { matches: true, addEventListener: () => {}, removeEventListener: () => {} } as MediaQueryList;
  }

  // ---- dsh-web-mobile 上游部分（整目录同步，勿手改 upstream/）----
  upstreamApply(ctx)

  // ---- pocket 附加层 ----

  // explorer 可用性标记（issue #48）：上游假定宿主装了 dsh-web-ui（aionui 列），
  // 官方 DSH 没有。探测列存在与否标到 frame 上，配 POCKET_EXTRA_CSS 隐藏死按钮。
  ctx.effect(() => {
    if (!narrow.matches) return () => {}
    const frame = (): HTMLElement | null => document.querySelector('[data-mobile-nav="frame"]')
    const check = () => {
      const has = document.querySelector('[data-aionui-explorer-col]') !== null
      frame()?.setAttribute('data-mobile-nav-explorer', has ? '1' : '0')
    }
    check()
    const timer = window.setTimeout(check, 1500) // 宿主懒渲染：稍后再查一次
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, 'dsh-pocket: explorer availability (issue #48)')

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-pocket'
    tag.dataset.pluginCss = 'dsh-pocket/mobile-extras.css'
    tag.textContent = POCKET_EXTRA_CSS
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'dsh-pocket: mobile extra styles (issue #17/#48)')

  // 移动端文件守卫（issue #17 修正）：手机上点 dsh-web 渲染的文件链接会触发桌面
  // 端 workspaces.openPath(open ...) —— 既打不开（路径在电脑上），又会抛
  // "path open failed"。这里在捕获阶段拦截这类点击 / 键盘激活，改为弹一个提示，
  // 并隐藏「添加工作区」入口（手机上配工作区无意义）；同时在文件链接旁注入
  // 「复制」按钮，点它经主机 RPC 读取文件正文再写入剪贴板。只挂窄屏。
  ctx.effect(() => {
    if (!narrow.matches) return () => {}
    // 尽量拿到当前工作区 cwd（文件链接文案是相对它的），传给主机 RPC 做精确解析；
    // 拿不到就回退到主机 process.cwd()。dsh-web 的 workspaces 服务暴露当前工作区。
    const getWorkspaceCwd = (): string => {
      try {
        const ws = (ctx as unknown as { get?: (k: string) => unknown }).get?.('workspaces')
          ?? (ctx as unknown as { workspaces?: unknown }).workspaces
        const list = (ws as { list?: unknown })?.list
        const arr: unknown[] | null = Array.isArray(list)
          ? list
          : (list && typeof list === 'object' && 'value' in (list as object)
            ? (list as { value: unknown[] }).value
            : null)
        if (Array.isArray(arr)) {
          for (const w of arr) {
            const c = (w as { cwd?: string; root?: string })?.cwd
              ?? (w as { cwd?: string; root?: string })?.root
            if (typeof c === 'string' && c) return c
          }
        }
      } catch { /* 忽略，回退 process.cwd() */ }
      return ''
    }
    // 手机侧读文件回调：走 dsh-pocket 的 RPC 通道，由主机侧 fileRead 端点处理。
    const readFile = (filePath: string) =>
      ctx.connection.rpc.call(
        POCKET_RPC_CHANNEL,
        POCKET_ENDPOINTS.fileRead,
        { path: filePath, cwd: getWorkspaceCwd() },
      ) as Promise<{ ok: boolean; value?: { content: string; path: string; size: number }; error?: { message: string } }>
    return startFileGuard(readFile)
  }, 'dsh-pocket: file open guard + copy button + hide add-workspace (issue #17)')
}

// Type-only augmentation imports: pull the layout / conversation / sidebar /
// settings SlotMap merges and the sessionLogDownload service typing into this
// program without any runtime import.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-session-log-export/client'
