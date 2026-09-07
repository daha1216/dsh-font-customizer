# dsh-pocket 移动端移植层（dsh-web-mobile 同步机制）

pocket 的移动端适配移植自 [dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile)（MIT，LICENSE.dsh-web-mobile）。
本目录的结构让「上游更新 → 同步进 pocket」成为一条命令的事。

## 目录结构

```
client/mobile/
  upstream/            ← dsh-web-mobile src/client/** 原样镜像（勿手改！）
  mobile-apply.tsx     ← pocket 适配器：布局门控 → 调 upstream apply → pocket 附加层
  fileGuard.ts         ← pocket 专属：issue #17 文件链接守卫 + 「复制」按钮
  layout-mode.mjs      ← pocket 专属：issue #74 ?dsh-layout= 强制布局
  LICENSE.dsh-web-mobile
  PORTING.md           ← 本文件
```

**原则：`upstream/` 里零手改。** 所有 pocket 特有逻辑都住在适配器和 pocket 专属文件里。
上游的一切（样式、手势、reconciler、slots 组件）都从 upstream/ 原样打包。

## 同步步骤（上游发新版后）

```powershell
node C:\Users\daha\.dsh\dsh-pocket\sync-dsh-web-mobile.mjs          # 跟 origin/main
node C:\Users\daha\.dsh\dsh-pocket\sync-dsh-web-mobile.mjs v2.4.0   # 或指定 tag
```

脚本会：fetch → 镜像 src/client → esbuild 重建 client.js → node --check。
产物 `client/client.js` 由 esbuild 打包 upstream/ + 适配器 + fileGuard 为一个
`window.__ModuleLoader__.load` 包装的 CJS bundle（react 与
`@deepseek-ai/dsh-client-ui-primitives` 保持 external）。

构建依赖 esbuild：vendored 于 `C:\Users\daha\.dsh\dsh-pocket\vendor\node_modules\`
（esbuild@0.28.1 + @esbuild/win32-x64），sync 脚本自动 junction 进包内 node_modules。
`dsh plugin update dsh-pocket` 重装包后 junction 会丢——重跑 sync 脚本即可恢复。

**同步后必做：**
1. 重启 dsh web（`node C:\Users\daha\.dsh\dsh-pocket\detached-restart.cjs`，注意会断当前会话）。
   combo URL 的 rev 启动时重分配，无缓存问题。
2. WebKit（JSC/同 iPhone 引擎）回归：登录 PIN → 开历史会话（对话渲染）→ 抽屉开合 → 左缘右滑。
3. 若上游改了 slots 注册或 inject 依赖，检查适配器（mobile-apply.tsx）里 upstreamApply 的调用注释。

## 移植历史

- pocket 原移植基线 ≈ 上游 **v1.0.0**（MobileNavToggle/MobileDrawerFooter 逐字相同）。
- **2026-09-06 同步到 main @75d2311（v2.3.0 + PR #47）**：补齐 v1.5.0→v2.3.0 五个版本——
  - v1.5.0/v2.0.0：哈希类选择器改子串匹配 + `:not` 守卫（CSS 稳定性）、phase 2-4 代码重组
  - v2.1.1：大 JSON 压缩（宿主侧，pocket 未采用，见下）、子代理弹卡、抽屉点会话收起、输入区钉位
  - v2.2.0：抽屉「收起但不打开」修复 (#32)、子代理芯片一闪即退、iOS 点搜索框强制放大修复（PR#35 字号≥16px）、刘海屏输入框下方露白
  - v2.3.0：左缘 45% 右滑手势 (#16/PR#37)、流式每帧开销优化（raf-scheduler）、抽屉屏外跳渲染、手势后点按无响应、Android 左缘滑触发返回（overscroll-behavior-x）、起指让位横滚容器、减弱动态效果禁动画、debug 徽章重接线（?mobile-nav-debug=1）、隐形热区改纯几何判定

## pocket 附加层（适配器 mobile-apply.tsx 负责，上游没有的）

1. **布局门控（issue #74）**：`?dsh-layout=` > localStorage > auto。desktop → 整段 mobile 不挂。
2. **explorer 可用性标记（issue #48）**：官方 DSH 无 dsh-web-ui/aionui 列；探测
   `[data-aionui-explorer-col]` 存在与否 → `data-mobile-nav-explorer="0|1"`，
   配 POCKET_EXTRA_CSS 隐藏死掉的「文件浏览」入口。
3. **fileGuard（issue #17）**：拦文件链接点击、注入「复制」按钮（走 pocket RPC fileRead）、
   隐藏「添加工作区」。依赖的 CSS 规则（copy-file 按钮样式、aria-label 隐藏）也搬进了
   POCKET_EXTRA_CSS（上游样式表没有这些）。

## 故意不移植的部分

- **src/index.ts + src/compress.ts（宿主侧响应压缩）**：pocket 的 lib/proxy.mjs 已在代理层
  做大 JSON/文本的 gzip/br 流式压缩（跳过 SSE），上游的 ServerResponse 补丁与之重复且可能
  双重压缩，不采用。
- **上游 MobileNavOverlay → 已被上游自己的 reconciler 任务取代**：v2.3.0 的
  overlay-backdrop-fab 任务（createOverlayTask）就是 backdrop + FAB 的实现，pocket 旧
  MobileNavOverlay.tsx + nav-targets.mjs 已退役删除。

## 已知行为差异（相对 pocket v1.0.0 时代移植）

1. **断点加了触屏判定**：上游 MOBILE_QUERY = `(max-width: 1023px) and (pointer: coarse)`。
   桌面浏览器窄窗不再进入移动布局（旧移植只用宽度）。真机 iPhone/安卓不受影响。
2. **`?dsh-layout=mobile` 强制模式部分降级**：pocket 附加层（fileGuard、explorer 探测）仍会
   强制挂载；但上游的样式与效果按自身媒体查询门控，在鼠标指针的桌面浏览器上不会强制出
   移动布局（旧移植可以）。真机上强制 mobile 不受影响（本来就是 coarse pointer）。
   `?dsh-layout=desktop`（主要用法：宽屏手机/平板强制电脑布局）不受影响。
