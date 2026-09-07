# dsh-pocket 字母+数字密码补丁 v3（幂等，可重复运行）
# 规则：字母/数字组合，>=8 位，不限长度。
# 兼容来源状态：2.8.0 原版(恰好8位字母数字) / 更早版本原文 / 已是 v2 补丁态 —— 全部收敛到 v2。
# 用途：插件更新或重装后跑一遍本脚本即可恢复补丁。
# 注意：改动 lib/*.js 后需要【重启 dsh web】才生效；client/* 刷新页面即生效。
$ErrorActionPreference = 'Stop'
$dir = 'C:\Users\daha\.dsh\profiles\web\node_modules\dsh-pocket'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$RE_V2   = 'const PIN_RE = /^[A-Za-z\d]{8,}$/; // patched: alnum >=8 no max'
$ERR_V2  = "throw new Error('密码需为字母/数字组合，至少 8 位，不限长度 | PIN: 8+ letters/digits, no upper limit');"
$IN_V2   = '<input name="token" type="password" autocomplete="current-password" autofocus required>'
$CUST_V2 = "'customizing': '新密码（字母/数字，≥8 位，不限长度）：',"
$INV_V2  = "'pinInvalid': '密码需为字母/数字组合，至少 8 位，不限长度',"
$CUST_EN = "'customizing': 'New PIN (letters/digits, 8+ chars, no limit): ',"
$INV_EN  = "'pinInvalid': 'PIN: 8+ letters/digits, no upper limit',"

function Esc($s) { [regex]::Escape($s) }

$patches = @(
    @{ file = 'lib\index.js'
       find = 'const PIN_RE = /\^\[a-zA-Z0-9\]\{8\}\$/;|const PIN_RE = /\^\\d\{8\}\$/;|const PIN_RE = /\^\[A-Za-z\\d\]\{8,32\}\$/;.*'
       repl = $RE_V2 }
    @{ file = 'lib\index.js'
       find = (Esc("throw new Error('密码必须是 8 位英文字母或数字 | PIN must be exactly 8 characters (letters and digits only)');")) + '|' +
              (Esc("throw new Error('密码必须是 8 位数字 | PIN must be exactly 8 digits');")) + '|' +
              (Esc("throw new Error('密码必须是字母+数字组合，8~32 位 | PIN must be 8-32 letters/digits');"))
       repl = $ERR_V2 }
    @{ file = 'lib\proxy.mjs'
       find = (Esc('<input name="token" type="password" maxlength="8" autocomplete="one-time-code" autofocus required>')) + '|' +
              (Esc('<input name="token" type="password" inputmode="numeric" maxlength="8" autocomplete="one-time-code" autofocus required>')) + '|' +
              (Esc('<input name="token" type="password" maxlength="32" autocomplete="current-password" autofocus required>'))
       repl = $IN_V2 }
    @{ file = 'lib\proxy.mjs'; find = '请输入 8 位密码（英文字母或数字）|请输入 8 位数字密码|请输入访问密码'; repl = '请输入访问密码' }
    @{ file = 'lib\proxy.mjs'; find = 'enter the 8-character PIN \(letters/digits\)|enter the 8-digit PIN|enter your access PIN'; repl = 'enter your access PIN' }
    @{ file = 'client\client.js'
       find = 'maxLength:\s*8,'
       repl = '' }
    @{ file = 'client\client.js'
       find = (Esc('e.target.value.replace(/[^a-zA-Z0-9]/g, "")')) + '|' + (Esc('e.target.value.replace(/\D/g, "")')) + '|' + (Esc('e.target.value.replace(/[^A-Za-z\d]/g, "")'))
       repl = 'e.target.value.replace(/[^A-Za-z\d]/g, "")' }
    @{ file = 'client\pocket-locales.js'
       find = (Esc("'customizing': '新密码（8 位，英文字母或数字）：',")) + '|' +
              (Esc("'customizing': '新密码（8 位数字）：',")) + '|' +
              (Esc("'customizing': '新密码（字母+数字，8~32 位）：',"))
       repl = $CUST_V2 }
    @{ file = 'client\pocket-locales.js'
       find = (Esc("'pinInvalid': '密码必须是 8 位英文字母或数字',")) + '|' +
              (Esc("'pinInvalid': '密码必须是 8 位数字',")) + '|' +
              (Esc("'pinInvalid': '密码必须是字母+数字组合，8~32 位',"))
       repl = $INV_V2 }
    @{ file = 'client\pocket-locales.js'
       find = (Esc("'customizing': 'New PIN (8 chars, letters/digits): ',"))
       repl = $CUST_EN }
    @{ file = 'client\pocket-locales.js'
       find = (Esc("'pinInvalid': 'PIN must be exactly 8 characters (letters and digits only)',"))
       repl = $INV_EN }
)

foreach ($p in $patches) {
    $path = Join-Path $dir $p.file
    if (-not (Test-Path $path)) { Write-Host "SKIP missing: $($p.file)"; continue }
    $t = [System.IO.File]::ReadAllText($path, $utf8)
    if ([regex]::IsMatch($t, $p.find)) {
        $t = [regex]::Replace($t, $p.find, $p.repl)
        [System.IO.File]::WriteAllText($path, $t, $utf8)
        Write-Host "PATCHED: $($p.file)"
    } elseif (($p.repl -ne '' -and $t.Contains($p.repl)) -or ($p.repl -eq '' -and -not [regex]::IsMatch($t, $p.find))) {
        Write-Host "OK already-target: $($p.file)"
    } else {
        Write-Host "WARN no-match (version changed?): $($p.file) find=$($p.find)"
    }
}
Write-Host ''
Write-Host 'Done. If lib/ files changed, RESTART dsh web to take effect.'