// detached-patch-orchestrator.cjs — v2: while dsh web is DEAD:
//   1. pnpm install                -> scrub patched refs from lockfile, relink pristine
//   2. pnpm patch dsh-pocket       -> fresh pristine staging (29 files)
//   3. cpSync backup over staging  -> desired state; dest-only files survive => no delete hunks
//   4. pnpm patch-commit <staging> -> write patch + register + apply install
//   5. verify markers, spawn web, wait 3081
// Log: C:/Users/daha/.dsh/dsh-pocket/install-restart.log (appended)
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const LOG = 'C:/Users/daha/.dsh/dsh-pocket/install-restart.log';
const stamp = () => new Date().toISOString();
const log = (m) => { try { fs.appendFileSync(LOG, `${stamp()} [v2] ${m}\n`); } catch {} };

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const ARGS = ['--expose-internals', '--use-env-proxy',
  'C:\\dsh\\deepseek-harness\\apps\\cli\\lib\\bin.js',
  'web', '--no-open'];
const CWD = 'C:\\Users\\daha';
const PROFILE = 'C:\\Users\\daha\\.dsh\\profiles\\web';
const PROXY = PROFILE + '\\node_modules\\dsh-pocket\\lib\\proxy.mjs';
const BACKUP = 'I:\\glm\u5de5\u4f5c\u533a\\dsh-font-customizer\\backup\\plugins\\dsh-pocket';
const PATCHES_DIR = PROFILE + '\\node_modules\\.pnpm_patches';

function portUp(port, cb) {
  const s = net.connect(port, '127.0.0.1');
  s.once('connect', () => { s.destroy(); cb(true); });
  s.once('error', () => cb(false));
}
function waitPort(port, wantUp, tries, interval, cb) {
  portUp(port, (up) => {
    if (up === wantUp || tries <= 0) return cb(up === wantUp);
    setTimeout(() => waitPort(port, wantUp, tries - 1, interval, cb), interval);
  });
}
function listenersOn(port, cb) {
  const out = [];
  const p = spawn('cmd.exe', ['/c', 'netstat -ano -p tcp'], { stdio: ['ignore', 'pipe', 'ignore'] });
  p.stdout.on('data', (d) => out.push(d));
  p.on('close', () => {
    const pids = new Set();
    for (const line of Buffer.concat(out).toString('utf8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`));
      if (m) pids.add(m[1]);
    }
    cb([...pids]);
  });
  p.on('error', () => cb([]));
}
function sh(cmd, opts) {
  return execSync(cmd, { cwd: PROFILE, encoding: 'utf8', timeout: 480000, ...opts });
}

log('--- v2 orchestrator alive, arming in 12s ---');
setTimeout(() => {
  log('step1: killing dsh web');
  listenersOn(3080, (pids) => {
    log(`  listeners on 3080: ${pids.join(', ') || '(none)'}`);
    for (const pid of pids) {
      try { spawn('cmd.exe', ['/c', `taskkill /F /PID ${pid}`], { stdio: 'ignore' }); } catch {}
    }
    waitPort(3080, false, 150, 200, (free) => {
      log(`step2: 3080 free=${free}`);
      let failed = false;
      try {
        log('step3: pnpm install (scrub lockfile -> pristine)');
        sh('pnpm install');
        log('  ok');
      } catch (ex) { failed = true; log(`  FAILED: ${ex && (ex.message || ex)}`); }
      let staging = '';
      if (!failed) {
        try {
          log('step4: pnpm patch dsh-pocket');
          try { fs.rmSync(PATCHES_DIR, { recursive: true, force: true }); log('  cleared .pnpm_patches'); } catch {}
          const out = sh('pnpm patch dsh-pocket');
          const m = out.match(/edit the package at:\s*\r?\n\s*(\S+)/);
          staging = m ? m[1] : '';
          log(`  staging: ${staging || '(parse failed)'}`);
          if (!staging) failed = true;
        } catch (ex) { failed = true; log(`  FAILED: ${ex && (ex.message || ex)}`); }
      }
      if (!failed) {
        try {
          const st = fs.statSync(staging);
          const count = (function walk(d) { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = require('node:path').join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') n += walk(p); } else n++; } return n; })(staging);
          log(`  staging files (excl nested node_modules): ${count}`);
          if (count !== 29) { failed = true; log('  EXPECTED 29 pristine files - aborting to avoid bad diff'); }
        } catch (ex) { failed = true; log(`  staging check FAILED: ${ex && ex.message}`); }
      }
      if (!failed) {
        try {
          log('step5: overlay backup onto staging (cpSync force; dest-only files kept => no delete hunks)');
          fs.cpSync(BACKUP, staging, { recursive: true, force: true });
          const count = (function walk(d) { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = require('node:path').join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') n += walk(p); } else n++; } return n; })(staging);
          log(`  staging files now: ${count}`);
        } catch (ex) { failed = true; log(`  FAILED: ${ex && ex.message}`); }
      }
      if (!failed) {
        try {
          log('step6: pnpm patch-commit');
          const out = sh(`pnpm patch-commit "${staging}"`, { timeout: 480000 });
          log('  commit tail:\n' + out.split(/\r?\n/).slice(-8).join('\n  '));
        } catch (ex) {
          failed = true;
          log(`  commit FAILED: ${ex && (ex.message || ex)}`);
          if (ex && ex.stdout) log('  stdout tail:\n' + String(ex.stdout).split(/\r?\n/).slice(-8).join('\n  '));
        }
      }
      let marker = false;
      try { marker = fs.readFileSync(PROXY, 'utf8').includes('PHONE_DIAG_SCRIPT'); } catch {}
      log(`step7: patch marker PHONE_DIAG_SCRIPT=${marker} pipeline_ok=${!failed}`);
      log('step8: spawning fresh dsh web');
      try {
        const out = fs.openSync('C:/Users/daha/AppData/Local/Temp/dsh-restart-out.log', 'a');
        const err = fs.openSync('C:/Users/daha/AppData/Local/Temp/dsh-restart-err.log', 'a');
        const env = { ...process.env };
        delete env.DSH_SESSION_ID; delete env.DSH_SHELL; delete env.DSH_WEB_URL;
        const child = spawn(NODE, ARGS, { cwd: CWD, detached: true, stdio: ['ignore', out, err], env });
        child.unref();
        log(`  new dsh web spawned pid=${child.pid}`);
      } catch (ex) {
        log(`  spawn FAILED: ${ex && ex.message}`);
        return;
      }
      waitPort(3081, true, 240, 500, (up) => {
        log(`step9: ${up ? 'SUCCESS: 3081 (pocket proxy) is up' : 'TIMEOUT: 3081 not up - check dsh-restart-err.log'}`);
      });
    });
  });
}, 12000);
