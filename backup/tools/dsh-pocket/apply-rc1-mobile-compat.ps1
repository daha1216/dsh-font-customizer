[CmdletBinding()]
param(
  [string]$Profile = "web"
)

$ErrorActionPreference = "Stop"

$proxyPath = Join-Path $HOME ".dsh\profiles\$Profile\node_modules\dsh-pocket\lib\proxy.mjs"
if (-not (Test-Path -LiteralPath $proxyPath)) {
  throw "dsh-pocket proxy.mjs was not found: $proxyPath"
}

$safeMarker = "var v=ctx&&typeof ctx.get==='function'?ctx.get('connection',false):null;"
$unsafeMarker = "var op=ctx&&ctx.provide;"
$text = [System.IO.File]::ReadAllText($proxyPath)

if ($text.Contains($safeMarker) -and -not $text.Contains($unsafeMarker)) {
  Write-Host "The DSH rc.1 mobile compatibility fix is already applied."
  exit 0
}

if (-not $text.Contains($unsafeMarker)) {
  throw "This dsh-pocket build does not match the known 2.10.3 patch target. No file was changed."
}

$old = @'
      exp.apply=function(ctx){
        var op=ctx&&ctx.provide;
        if(typeof op==='function'){
          ctx.provide=function(n,v){
            if(n==='connection'&&v&&typeof v==='object'){
              try{Object.defineProperty(v,'isLoopback',{value:true,writable:true,configurable:true});}catch(e){v.isLoopback=true;}
            }
            return op.apply(this,arguments);
          };
        }
        return oa.apply(this,arguments);
      };
'@

$new = @'
      exp.apply=function(ctx){
        var out=oa.apply(this,arguments);
        function forceLoopback(){
          try{
            var v=ctx&&typeof ctx.get==='function'?ctx.get('connection',false):null;
            if(v&&typeof v==='object'){
              try{Object.defineProperty(v,'isLoopback',{value:true,writable:true,configurable:true});}catch(e){v.isLoopback=true;}
            }
          }catch(e){}
        }
        if(out&&typeof out.then==='function'){
          return out.then(function(v){forceLoopback();return v;});
        }
        forceLoopback();
        return out;
      };
'@

if (-not $text.Contains($old)) {
  throw "The known unsafe block was not found exactly. No file was changed."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "$proxyPath.pre-rc1-mobile-fix-$stamp.bak"
Copy-Item -LiteralPath $proxyPath -Destination $backupPath

$updated = $text.Replace($old, $new)
[System.IO.File]::WriteAllText(
  $proxyPath,
  $updated,
  [System.Text.UTF8Encoding]::new($false)
)

$node = Get-Command node -ErrorAction Stop
& $node.Source --check $proxyPath
if ($LASTEXITCODE -ne 0) {
  Copy-Item -LiteralPath $backupPath -Destination $proxyPath -Force
  throw "Syntax validation failed. The original proxy.mjs was restored."
}

Write-Host "Applied the DSH rc.1 mobile compatibility fix."
Write-Host "Backup: $backupPath"
Write-Host "Restart DSH Web for the change to take effect."
