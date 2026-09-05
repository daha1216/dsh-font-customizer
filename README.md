# dsh-font-customizer

[中文](#中文) · [English](#english)

## 中文

DeepSeek Harness（DSH）Web UI 的字体自定义插件：**界面字体、代码字体、正文字号**一站式调整，设置持久化在宿主机上，换浏览器、换设备都是同一套字体。

### 功能

- **界面字体**：覆盖全局 CSS 变量 `--dsw-font-family`，DSH 全部界面文字即时生效
- **代码字体**：覆盖 `--ds-font-family-code`，代码块 / 等宽区域即时生效
- **字号**：12–17px，优先接入客户端主题服务（与内置字号设置联动）
- **预设字体栈**：微软雅黑、思源黑体/宋体、霞鹜文楷、HarmonyOS Sans、MiSans、OPPOSans、楷体、仿宋、黑体、宋体；代码侧含 JetBrains Mono、Fira Code、Cascadia Code、更纱黑体（中英等宽）、MapMono、霞鹜文楷等宽等
- **本机字体探测**：预设列表用 canvas 宽度差法标注哪些字体本机已装（label 带 ✓）
- **全量字体扫描**：一键调用 `window.queryLocalFonts()`（Chrome/Edge 103+，需要授权），把本机全部已安装字体列进下拉框
- **自定义字体栈**：手写任意 CSS 字体栈
- **持久化**：配置存在 `${DSH_HOME:-~/.dsh}/dsh-font-customizer/config.json`（原子写入），由宿主半侧通过 `/dsh-font-customizer/config` 路由读写

修改即时预览、自动保存；「重置」一键恢复 DSH 内置字体。

### 安装

```sh
dsh plugin --profile web add github:daha1216/dsh-font-customizer
```

然后重启 DSH（`dsh web`），刷新页面，在 **设置 → 通用** 里找到「字体（dsh-font-customizer）」一行。

本地开发（仓库检出目录内）：

```sh
dsh plugin --profile web add .
```

### 卸载

```sh
dsh plugin --profile web remove dsh-font-customizer
```

配置文件不会自动删除，需要时手动删 `~/.dsh/dsh-font-customizer/`。

### 使用说明

- **预设里的 ✓** 表示该字体家族在本机已安装（探测法，个别字体可能误报）
- **扫描本机字体**首次点击时浏览器会弹出「本地字体」权限询问，允许后下拉框出现「本机已安装（N）」分组
- **自定义**选择后输入 CSS 字体栈，如 `'LXGW WenKai', sans-serif`；界面字体栈尾建议 `sans-serif`，代码字体栈尾建议 `monospace`
- 字号选「默认（跟随 DSH 内置）」时完全交还内置字号设置管理

### 工作原理

| 半侧 | 文件 | 职责 |
| --- | --- | --- |
| 宿主 | `dsh/index.js` | 注册 `/dsh-font-customizer/config` HTTP 路由，配置原子落盘 |
| 浏览器 | `dsh/client.js` | 拉取配置 → 覆盖 `:root` CSS 变量；设置页 UI；字体探测/扫描 |

两个半侧零依赖、零构建：宿主是纯 ESM + Node 内置模块；客户端手写懒 CJS 协议（`window.__ModuleLoader__.load`），`react` 由 DSH 模块表提供。

---

## English

Font customizer plugin for the DeepSeek Harness (DSH) Web UI: **UI font family, code font family, and content font size** in one settings row. Settings persist on the host, so every browser and device gets the same fonts.

### Features

- **UI font**: overrides the global CSS variable `--dsw-font-family` — applies to all DSH interface text instantly
- **Code font**: overrides `--ds-font-family-code`
- **Font size**: 12–17px, wired into the client theme service when available
- **Preset stacks** for CJK-friendly fonts (Microsoft YaHei, Source Han Sans/Serif, LXGW WenKai, HarmonyOS Sans, MiSans, OPPOSans, KaiTi, FangSong, …) and coding fonts (JetBrains Mono, Fira Code, Cascadia Code, Sarasa Gothic, MapMono, …)
- **Local font detection** via canvas width-diff probing (installed families get a ✓)
- **Full local font scan** via `window.queryLocalFonts()` (Chrome/Edge 103+, permission required)
- **Custom CSS font stacks**
- **Persistence**: stored at `${DSH_HOME:-~/.dsh}/dsh-font-customizer/config.json` (atomic writes) behind the host route `/dsh-font-customizer/config`

Changes preview instantly and auto-save; the reset button restores DSH's built-in fonts.

### Install

```sh
dsh plugin --profile web add github:daha1216/dsh-font-customizer
```

Restart DSH (`dsh web`) and refresh the page — the row appears under **Settings → General** as「字体（dsh-font-customizer）」.

For local development, from a checkout of this repo:

```sh
dsh plugin --profile web add .
```

### License

MIT © daha1216
