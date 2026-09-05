// dsh-font-customizer —— 浏览器半侧
//
// 职责：字体渲染与设置 UI。
//  - 页面加载即从宿主拉取配置并应用到 :root（覆盖 --dsw-font-family /
//    --ds-font-family-code 两个全局 CSS 变量，DSH 全部界面文字与代码文字
//    都引用它们，因此一处覆盖全局生效）；
//  - 字号优先走客户端 theme 服务的 setFontSize(12..17)，拿不到服务时
//    直接写 --dsh-content-font-size 到 body 作为兜底；
//  - 设置页「通用」区插入一行：界面字体 / 代码字体 / 字号三件套，
//    预设字体栈 + 本机字体探测（canvas 宽度差法）+ queryLocalFonts
//    全量扫描（Chrome/Edge 103+，需要用户手势与本地字体权限）；
//  - 所有修改即时预览并 PUT 回宿主持久化（跨浏览器、跨设备一致）。
//
// 手写懒 CJS 协议（window.__ModuleLoader__.load），零构建、零依赖；
// react 通过模块表 require 获得。

window.__ModuleLoader__.load({
  id: 'dsh-font-customizer',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    // ------------------------------------------------------------------
    // 常量
    // ------------------------------------------------------------------

    var ROUTE = '/dsh-font-customizer'
    var CUSTOM = '__custom__'

    /** 界面字体预设。probe = 用于本机探测的首家族名。栈尾统一 sans-serif，
     *  避免裸 generic 尾在 Windows 上把中文回退到 SimSun。 */
    var UI_PRESETS = [
      { label: '微软雅黑', probe: 'Microsoft YaHei', stack: "'Microsoft YaHei', 'Segoe UI', sans-serif" },
      { label: '思源黑体', probe: 'Source Han Sans SC', stack: "'Source Han Sans SC', 'Noto Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif" },
      { label: '思源宋体', probe: 'Source Han Serif SC', stack: "'Source Han Serif SC', 'Noto Serif SC', 'Noto Serif CJK SC', serif" },
      { label: '霞鹜文楷', probe: 'LXGW WenKai', stack: "'LXGW WenKai', 'LXGW WenKai Lite', 'LXGW WenKai Screen', 'Microsoft YaHei', sans-serif" },
      { label: 'HarmonyOS Sans', probe: 'HarmonyOS Sans SC', stack: "'HarmonyOS Sans SC', 'HarmonyOS Sans', 'Microsoft YaHei', sans-serif" },
      { label: 'MiSans', probe: 'MiSans', stack: "'MiSans', 'MiSans VF', 'Microsoft YaHei', sans-serif" },
      { label: 'OPPOSans', probe: 'OPPOSans', stack: "'OPPOSans', 'Microsoft YaHei', sans-serif" },
      { label: '楷体', probe: 'KaiTi', stack: "'KaiTi', 'STKaiti', 'KaiTi_GB2312', 'Microsoft YaHei', serif" },
      { label: '仿宋', probe: 'FangSong', stack: "'FangSong', 'STFangsong', 'FangSong_GB2312', 'Microsoft YaHei', serif" },
      { label: '黑体', probe: 'SimHei', stack: "'SimHei', 'Microsoft YaHei', sans-serif" },
      { label: '宋体', probe: 'SimSun', stack: "'SimSun', 'NSimSun', serif" },
    ]

    /** 代码字体预设。栈尾统一 monospace。 */
    var CODE_PRESETS = [
      { label: 'JetBrains Mono', probe: 'JetBrains Mono', stack: "'JetBrains Mono', Consolas, 'Courier New', monospace" },
      { label: 'Fira Code', probe: 'Fira Code', stack: "'Fira Code', Consolas, 'Courier New', monospace" },
      { label: 'Cascadia Code', probe: 'Cascadia Code', stack: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace" },
      { label: '更纱黑体（中英等宽）', probe: 'Sarasa Mono SC', stack: "'Sarasa Mono SC', 'Sarasa Gothic SC', 'Sarasa Term SC', 'JetBrains Mono', Consolas, monospace" },
      { label: 'MapMono', probe: 'MapMono', stack: "'MapMono', 'JetBrains Mono', Consolas, monospace" },
      { label: '霞鹜文楷等宽', probe: 'LXGW WenKai Mono', stack: "'LXGW WenKai Mono', 'LXGW WenKai Lite Mono', Consolas, monospace" },
      { label: 'Consolas', probe: 'Consolas', stack: "Consolas, 'Courier New', monospace" },
    ]

    var FONT_SIZES = [12, 13, 14, 15, 16, 17]
    var FONT_SIZE_DEFAULT = 14

    // ------------------------------------------------------------------
    // 模块级状态
    // ------------------------------------------------------------------

    /** detectFamily 结果缓存：family -> boolean。 */
    var detected = {}
    /** queryLocalFonts 全量扫描结果（家族名数组），插件生命周期内缓存。 */
    var scannedFamilies = null
    /** 我们是否亲手写过 body 上的 --dsh-content-font-size（dispose 时要清）。 */
    var touchedBodyVar = false

    // ------------------------------------------------------------------
    // 本机字体探测
    // ------------------------------------------------------------------

    /**
     * canvas 宽度差法：同一探测文本，比较 `16px monospace` 与
     * `16px '<family>', monospace` 的渲染宽度，不同即认为家族已安装。
     * 结果缓存；canvas 不可用时一律返回 false。
     */
    function detectFamily(family) {
      if (!family) return false
      if (Object.prototype.hasOwnProperty.call(detected, family)) return detected[family]
      var installed = false
      try {
        var canvas = document.createElement('canvas')
        var g = canvas.getContext('2d')
        if (g) {
          var probe = 'mmmwwwiiilll012 汉字测试'
          g.font = '16px monospace'
          var w1 = g.measureText(probe).width
          g.font = "16px '" + family + "', monospace"
          var w2 = g.measureText(probe).width
          installed = Math.abs(w1 - w2) > 0.5
        }
      } catch (e) {
        installed = false
      }
      detected[family] = installed
      return installed
    }

    /**
     * 全量扫描本机字体（window.queryLocalFonts，Chrome/Edge 103+）。
     * 需要用户手势触发与「本地字体」权限；结果去重并按 zh-Hans-CN 排序。
     */
    function scanLocalFonts() {
      if (scannedFamilies) return Promise.resolve(scannedFamilies)
      if (typeof window.queryLocalFonts !== 'function') {
        return Promise.reject(new Error('当前浏览器不支持字体扫描（需要 Chrome/Edge 103+）'))
      }
      return window.queryLocalFonts().then(function (fonts) {
        var seen = {}
        var list = []
        for (var i = 0; i < fonts.length; i++) {
          var family = fonts[i] && fonts[i].family
          if (!family || seen[family]) continue
          seen[family] = true
          list.push(family)
        }
        list.sort(function (a, b) { return a.localeCompare(b, 'zh-Hans-CN') })
        scannedFamilies = list
        return list
      })
    }

    // ------------------------------------------------------------------
    // DOM 应用 / 清理
    // ------------------------------------------------------------------

    /** 客户端 theme 服务（可选）：有则用它管字号，与内置字号设置行联动。 */
    function resolveTheme(ctx) {
      try {
        if (typeof ctx.get === 'function') {
          var theme = ctx.get('theme')
          if (theme && typeof theme.setFontSize === 'function') return theme
        }
      } catch (e) { /* 服务不存在时 cordis 返回 undefined */ }
      return null
    }

    /** 把一份配置写到 DOM。空栈 = 移除覆盖（跟随 DSH 内置）。 */
    function applyToDom(cfg, theme) {
      if (typeof document === 'undefined') return
      var root = document.documentElement
      if (cfg.uiStack) root.style.setProperty('--dsw-font-family', cfg.uiStack)
      else root.style.removeProperty('--dsw-font-family')
      if (cfg.codeStack) root.style.setProperty('--ds-font-family-code', cfg.codeStack)
      else root.style.removeProperty('--ds-font-family-code')

      if (cfg.fontSize > 0) {
        var applied = false
        if (theme) {
          try { theme.setFontSize(cfg.fontSize); applied = true } catch (e) { applied = false }
        }
        if (!applied && document.body) {
          document.body.style.setProperty('--dsh-content-font-size', cfg.fontSize + 'px')
          touchedBodyVar = true
        }
      } else if (touchedBodyVar && document.body) {
        // 从接管退回"跟随内置"：清掉我们亲手写的 body 变量。
        document.body.style.removeProperty('--dsh-content-font-size')
        touchedBodyVar = false
      }
    }

    /** dispose 清理：恢复所有覆盖。 */
    function clearDom() {
      if (typeof document === 'undefined') return
      document.documentElement.style.removeProperty('--dsw-font-family')
      document.documentElement.style.removeProperty('--ds-font-family-code')
      if (touchedBodyVar && document.body) {
        document.body.style.removeProperty('--dsh-content-font-size')
        touchedBodyVar = false
      }
    }

    // ------------------------------------------------------------------
    // 宿主持久化
    // ------------------------------------------------------------------

    function fetchConfig() {
      return fetch(ROUTE + '/config', { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
    }

    function saveConfig(cfg) {
      return fetch(ROUTE + '/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
    }

    // ------------------------------------------------------------------
    // state <-> config 换算
    // ------------------------------------------------------------------

    /** select 的 value 直接就是栈字符串（'' = 默认，CUSTOM = 自定义输入）。 */
    function selOf(stack, presets) {
      if (!stack) return ''
      for (var i = 0; i < presets.length; i++) {
        if (presets[i].stack === stack) return stack
      }
      return CUSTOM
    }

    function stateFromConfig(cfg) {
      return {
        uiSel: selOf(cfg.uiStack, UI_PRESETS),
        uiCustom: cfg.uiStack || '',
        codeSel: selOf(cfg.codeStack, CODE_PRESETS),
        codeCustom: cfg.codeStack || '',
        fontSize: cfg.fontSize > 0 ? cfg.fontSize : 0,
      }
    }

    function configOf(state) {
      var uiStack = state.uiSel === CUSTOM ? state.uiCustom.trim() : state.uiSel
      var codeStack = state.codeSel === CUSTOM ? state.codeCustom.trim() : state.codeSel
      return {
        uiStack: uiStack || '',
        codeStack: codeStack || '',
        fontSize: state.fontSize > 0 ? state.fontSize : 0,
      }
    }

    // ------------------------------------------------------------------
    // 设置行 UI
    // ------------------------------------------------------------------

    var fieldStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap',
      minHeight: '30px',
    }
    var labelStyle = {
      flex: '0 0 auto',
      minWidth: '68px',
      fontSize: '13px',
      opacity: 0.85,
    }
    var selectStyle = {
      flex: '0 1 auto',
      minWidth: '200px',
      maxWidth: '320px',
    }
    var inputStyle = {
      flex: '1 1 220px',
      minWidth: '180px',
    }
    var buttonStyle = {
      flex: '0 0 auto',
      cursor: 'pointer',
    }
    var msgStyle = {
      fontSize: '12px',
      opacity: 0.65,
      minHeight: '16px',
      paddingTop: '2px',
    }

    /** 预设 optgroup：已安装的家族在 label 后加 ✓。 */
    function presetOptions(React, presets) {
      var items = [
        React.createElement('option', { key: '__default__', value: '' }, '默认（跟随 DSH）'),
      ]
      for (var i = 0; i < presets.length; i++) {
        var p = presets[i]
        var label = p.label + (detectFamily(p.probe) ? ' ✓' : '')
        items.push(React.createElement('option', { key: p.label, value: p.stack }, label))
      }
      return items
    }

    /** 本机已安装 optgroup（扫描后出现）。fallbackTail：UI 用 sans-serif，代码用 monospace。 */
    function localOptions(React, families, fallbackTail) {
      if (!families || families.length === 0) return null
      var items = []
      for (var i = 0; i < families.length; i++) {
        var family = families[i]
        items.push(React.createElement(
          'option',
          { key: 'local-' + family, value: "'" + family + "', " + fallbackTail },
          family,
        ))
      }
      return React.createElement('optgroup', { key: 'local', label: '本机已安装（' + families.length + '）' }, items)
    }

    function createFontRow(React, theme) {
      function FontRow() {
        var stateRef = React.useRef({ uiSel: '', uiCustom: '', codeSel: '', codeCustom: '', fontSize: 0 })
        var state = stateRef.current

        var forceUpdate = React.useReducer(function (x) { return x + 1 }, 0)[1]
        var localFamilies = React.useRef(null)
        var scanning = React.useRef(false)
        var saveTimer = React.useRef(0)
        var msg = React.useRef('')

        function setMsg(text) {
          msg.current = text
          forceUpdate()
        }

        function persist() {
          var cfg = configOf(state)
          applyToDom(cfg, theme)
          setMsg('保存中…')
          saveConfig(cfg).then(
            function () { setMsg('已保存 ✓') },
            function (err) { setMsg('保存失败：' + (err && err.message ? err.message : err)) },
          )
        }

        /** 即时预览 + 800ms 防抖落盘（自定义输入框每键触发时用）。 */
        function persistDebounced() {
          var cfg = configOf(state)
          applyToDom(cfg, theme)
          setMsg('保存中…')
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(persist, 800)
        }

        function onUiSel(e) {
          state.uiSel = e.target.value
          persist()
          forceUpdate()
        }
        function onUiCustom(e) {
          state.uiCustom = e.target.value
          persistDebounced()
          forceUpdate()
        }
        function onCodeSel(e) {
          state.codeSel = e.target.value
          persist()
          forceUpdate()
        }
        function onCodeCustom(e) {
          state.codeCustom = e.target.value
          persistDebounced()
          forceUpdate()
        }
        function onFontSize(e) {
          var v = Number(e.target.value)
          state.fontSize = v > 0 ? v : 0
          persist()
          forceUpdate()
        }
        function onScan() {
          if (scanning.current) return
          scanning.current = true
          setMsg('正在扫描本机字体…（如浏览器询问请允许）')
          scanLocalFonts().then(
            function (families) {
              scanning.current = false
              localFamilies.current = families
              setMsg('发现 ' + families.length + ' 款本机字体')
            },
            function (err) {
              scanning.current = false
              setMsg('扫描失败：' + (err && err.message ? err.message : err))
            },
          )
        }
        function onReset() {
          state.uiSel = ''
          state.uiCustom = ''
          state.codeSel = ''
          state.codeCustom = ''
          state.fontSize = 0
          persist()
          forceUpdate()
        }

        React.useEffect(function () {
          fetchConfig().then(
            function (cfg) {
              var next = stateFromConfig(cfg)
              stateRef.current = next
              forceUpdate()
            },
            function (err) { setMsg('读取配置失败：' + (err && err.message ? err.message : err)) },
          )
          return function () { if (saveTimer.current) clearTimeout(saveTimer.current) }
        }, [])

        var uiCustomVisible = state.uiSel === CUSTOM
        var codeCustomVisible = state.codeSel === CUSTOM

        return React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 0' } },

          React.createElement('div', { style: { fontSize: '13px', fontWeight: 600 } }, '字体（dsh-font-customizer）'),

          React.createElement('div', { style: fieldStyle },
            React.createElement('span', { style: labelStyle }, '界面字体'),
            React.createElement('select', { style: selectStyle, value: state.uiSel, onChange: onUiSel },
              presetOptions(React, UI_PRESETS),
              localOptions(React, localFamilies.current, 'sans-serif'),
              React.createElement('option', { key: 'custom', value: CUSTOM }, '自定义…'),
            ),
            uiCustomVisible
              ? React.createElement('input', {
                  style: inputStyle,
                  type: 'text',
                  placeholder: "字体栈，如 'LXGW WenKai', sans-serif",
                  value: state.uiCustom,
                  onChange: onUiCustom,
                })
              : null,
          ),

          React.createElement('div', { style: fieldStyle },
            React.createElement('span', { style: labelStyle }, '代码字体'),
            React.createElement('select', { style: selectStyle, value: state.codeSel, onChange: onCodeSel },
              presetOptions(React, CODE_PRESETS),
              localOptions(React, localFamilies.current, 'monospace'),
              React.createElement('option', { key: 'custom', value: CUSTOM }, '自定义…'),
            ),
            codeCustomVisible
              ? React.createElement('input', {
                  style: inputStyle,
                  type: 'text',
                  placeholder: "字体栈，如 'JetBrains Mono', monospace",
                  value: state.codeCustom,
                  onChange: onCodeCustom,
                })
              : null,
          ),

          React.createElement('div', { style: fieldStyle },
            React.createElement('span', { style: labelStyle }, '字号'),
            React.createElement('select', { style: selectStyle, value: String(state.fontSize), onChange: onFontSize },
              React.createElement('option', { key: 'auto', value: '0' }, '默认（跟随 DSH 内置）'),
              FONT_SIZES.map(function (n) {
                return React.createElement(
                  'option',
                  { key: String(n), value: String(n) },
                  String(n) + (n === FONT_SIZE_DEFAULT ? '（内置默认）' : ''),
                )
              }),
            ),
            React.createElement('button', { style: buttonStyle, type: 'button', onClick: onScan }, '扫描本机字体'),
            React.createElement('button', { style: buttonStyle, type: 'button', onClick: onReset }, '重置'),
          ),

          React.createElement('div', { style: msgStyle }, msg.current),
        )
      }
      return FontRow
    }

    // ------------------------------------------------------------------
    // 插件入口
    // ------------------------------------------------------------------

    function apply(ctx) {
      var React = require('react')
      var theme = resolveTheme(ctx)

      // 页面一加载就应用已保存的字体（无需打开设置页）。
      fetchConfig().then(
        function (cfg) { applyToDom(cfg, theme) },
        function () { /* 宿主路由异常时静默；设置行里会重试并提示 */ },
      )

      // 设置页「通用」区插入一行（内置外观行 order 10 / 字号行 order 11，
      // 取 order 20 紧随其后）。
      var FontRow = createFontRow(React, theme)
      ctx.slots.inject('settings.general.item', function* () {
        yield ctx.slots.register(
          { name: 'settings.general.item', id: 'dsh-font-customizer', order: 20 },
          FontRow,
        )
      })

      ctx.effect(
        function () { return function () { clearDom() } },
        'dsh-font-customizer: font var overrides',
      )
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
