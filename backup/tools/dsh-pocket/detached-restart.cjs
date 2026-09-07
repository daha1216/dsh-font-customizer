// dsh-pocket clean restart handoff (all-ASCII, no PowerShell 5.1 encoding pitfalls).
// Detached helper: waits 12s (let the caller finish speaking), then:
//   1. find PID listening on 3080 (netstat) and taskkill it
//   2. wait until 3080 is free (30s max)
//   3. spawn a fresh dsh web with the EXACT original command line (source checkout)
//   4. wait until 3081 (pocket proxy) is listening (120s max)
// Log: C:/Users/daha/.dsh/dsh-pocket/restart-clean.log
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const LOG = 'C:/Users/daha/.dsh/dsh-pocket/restart-clean.log';
const stamp = () => new Date().toISOString();
const log = (m) => { try { fs.appendFileSync(LOG, `${stamp()} ${m}\n`); } catch {} };

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const ARGS = ['--expose-internals', '--use-env-proxy',
  'C:\\dsh\\deepseek-harness\\apps\\cli\\lib\\bin.js',
  'web', '--no-open'];
const CWD = 'C:\\Users\\daha';

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

log('--- helper alive, arming in 12s ---');
setTimeout(() => {
  log('step1: killing current dsh web (listener on 3080)');
  listenersOn(3080, (pids) => {
    log(`  listeners on 3080: ${pids.join(', ') || '(none)'}`);
    for (const pid of pids) {
      try { spawn('cmd.exe', ['/c', `taskkill /F /PID ${pid}`], { stdio: 'ignore' }); } catch {}
    }
    waitPort(3080, false, 150, 200, (free) => { // 30s max
      log(`step2: 3080 free=${free}`);
      const env = { ...process.env };
      delete env.DSH_SESSION_ID; delete env.DSH_SHELL; delete env.DSH_WEB_URL;
      try {
        const out = fs.openSync('C:/Users/daha/AppData/Local/Temp/dsh-restart-out.log', 'a');
        const err = fs.openSync('C:/Users/daha/AppData/Local/Temp/dsh-restart-err.log', 'a');
        const child = spawn(NODE, ARGS, { cwd: CWD, detached: true, stdio: ['ignore', out, err], env });
        child.unref();
        log(`step3: new dsh web spawned pid=${child.pid}`);
      } catch (ex) {
        log(`step3 FAILED: ${ex && ex.message}`);
        return;
      }
      waitPort(3081, true, 240, 500, (up) => { // 120s max
        log(`step4: ${up ? 'SUCCESS: 3081 (pocket proxy) is up' : 'TIMEOUT: 3081 not up - check dsh-restart-err.log'}`);
      });
    });
  });
}, 25000);
