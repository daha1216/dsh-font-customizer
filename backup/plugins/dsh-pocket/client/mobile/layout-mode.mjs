// 布局模式判定（issue #74：宽屏手机/Pad 可选电脑布局）
//
// 优先级：URL 参数 (?dsh-layout=desktop|mobile|auto) > localStorage > 默认 auto。
//   - 'auto' 不写 localStorage，仅按 matchMedia 走；
//   - 显式 'desktop' / 'mobile' 同步到 localStorage，下次无 URL 参数也走同样布局。
//
// 纯函数，便于单测；mobile-apply.tsx 读 DOM/localStorage 喂进来。

/** @typedef {'mobile' | 'desktop'} ForcedLayout */

/** 解析输入。 */
export function resolveLayout({ urlValue, stored, narrowMatch }) {
  const url = String(urlValue ?? '').trim();
  if (url === 'desktop') return 'desktop';
  if (url === 'mobile') return 'mobile';
  // 'auto' / 空 / 非法值 → 用 localStorage / matchMedia
  if (stored === 'desktop' || stored === 'mobile') return stored;
  return narrowMatch ? 'mobile' : 'desktop';
}

/** 同步 localStorage 的副作用（在 mobileApply 入口跑一次）。返回最终存储值。
 *
 * 三种输入语义不同（issue #74 的持久化承诺：「下次无 URL 参数也走同样布局」）：
 *   - 'desktop' / 'mobile' → 写入存储；
 *   - 'auto' / ''（URL 里显式写了 dsh-layout=auto 或 dsh-layout=）→ 清除存储；
 *   - null / undefined（URL 里根本没有 dsh-layout 参数）→ **不动存储**，
 *     否则每次无参数加载都会把上次的显式选择抹掉，持久化形同虚设。
 */
export function persistLayoutFromUrl(urlValue) {
  if (typeof localStorage === 'undefined') return '';
  if (urlValue === null || urlValue === undefined) return readStoredLayout();
  const v = String(urlValue).trim();
  try {
    if (v === 'desktop' || v === 'mobile') localStorage.setItem('dsh-pocket.layout', v);
    else if (v === 'auto' || v === '') localStorage.removeItem('dsh-pocket.layout');
  } catch { /* 隐私模式/无 storage → 静默 */ }
  try {
    const s = localStorage.getItem('dsh-pocket.layout');
    return s === 'desktop' || s === 'mobile' ? s : '';
  } catch {
    return '';
  }
}

/** 读 localStorage 当前的 layout 值（'desktop' | 'mobile' | ''）。 */
export function readStoredLayout() {
  if (typeof localStorage === 'undefined') return '';
  try {
    const v = localStorage.getItem('dsh-pocket.layout');
    return v === 'desktop' || v === 'mobile' ? v : '';
  } catch {
    return '';
  }
}
