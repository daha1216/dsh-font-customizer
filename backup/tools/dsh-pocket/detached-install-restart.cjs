// detached-install-restart.cjs — one-shot detached orchestrator:
//   wait fuse -> kill dsh web (frees the locked .node module)
//   -> pnpm install in profile (completes relink, applies patchedDependencies)
//   -> verify patch markers -> spawn fresh dsh web -> wait for 3081.
// Log: C:/Users/daha/.dsh/dsh-pocket/install-restart.log
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const LOG = 'C:/Users/daha/.dsh/dsh-pocket/install-restart.log';
const stamp = () => new Date().toISOString();
const log = (m) => { try { fs.appendFileSync(LOG, `${stamp()} ${m}\n`); } catch {} };

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const ARGS = ['--expose-internals', '--use-env-proxy',
  'C:\\dsh\\deepseek-harness\\apps\\cli\\lib\\bin.js',
  'web', '--no-open'];
const CWD = 'C:\\Users\\daha';
const PROFILE = 'C:\\Users\\daha\\.dsh\\profiles\\web';
const PROXY = PROFILE + '\\node_modules\\dsh-pocket\\lib\\proxy.mjs';

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

log('--- orchestrator alive, arming in 12s ---');
setTimeout(() => {
  log('step1: killing dsh web (listener on 3080) to release .node module lock');
  listenersOn(3080, (pids) => {
    log(`  listeners on 3080: ${pids.join(', ') || '(none)'}`);
    for (const pid of pids) {
      try { spawn('cmd.exe', ['/c', `taskkill /F /PID ${pid}`], { stdio: 'ignore' }); } catch {}
    }
    waitPort(3080, false, 150, 200, (free) => {
      log(`step2: 3080 free=${free}`);
      log('step3: running pnpm install in profile (applies patchedDependencies)');
      let ok = false;
      try {
        const out = execSync('pnpm install', { cwd: PROFILE, encoding: 'utf8', timeout: 480000 });
        log('  install stdout tail:\n' + out.split(/\r?\n/).slice(-6).join('\n  '));
        ok = true;
      } catch (ex) {
        log(`  install FAILED: ${ex && (ex.message || ex)}`);
        if (ex && ex.stdout) log('  stdout tail:\n' + String(ex.stdout).split(/\r?\n/).slice(-6).join('\n  '));
      }
      let marker = false;
      try { marker = fs.readFileSync(PROXY, 'utf8').includes('PHONE_DIAG_SCRIPT'); } catch {}
      log(`step4: patch marker PHONE_DIAG_SCRIPT=${marker} install_ok=${ok}`);
      log('step5: spawning fresh dsh web');
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
        log(`step6: ${up ? 'SUCCESS: 3081 (pocket proxy) is up' : 'TIMEOUT: 3081 not up - check dsh-restart-err.log'}`);
      });
    });
  });
}, 12000);
