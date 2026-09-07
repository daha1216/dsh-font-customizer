// detached-opencode-commit.cjs — while dsh web is DEAD:
//   1. pnpm patch-commit <staging> -> write opencode patch + register + apply via install
//   2. verify: patch file, workspace registration, opencode isMobile guard, pocket PHONE_DIAG_SCRIPT
//   3. spawn web, wait 3081
// Staging was pre-overlayed with the guarded lib/client.js (pristine 41561 -> guarded 42287).
// Log: C:/Users/daha/.dsh/dsh-pocket/install-restart.log (appended)
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const LOG = 'C:/Users/daha/.dsh/dsh-pocket/install-restart.log';
const stamp = () => new Date().toISOString();
const log = (m) => { try { fs.appendFileSync(LOG, `${stamp()} [oc] ${m}\n`); } catch {} };

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const ARGS = ['--expose-internals', '--use-env-proxy',
  'C:\\dsh\\deepseek-harness\\apps\\cli\\lib\\bin.js',
  'web', '--no-open'];
const CWD = 'C:\\Users\\daha';
const PROFILE = 'C:\\Users\\daha\\.dsh\\profiles\\web';
const STAGING = PROFILE + '\\node_modules\\.pnpm_patches\\@xueayi/dsh-opencode-go-usage@https+codeload.github.com+xueayi+dsh-opencode-go-usage+tar.gz+8e4b6894a5dd2ba33ac79610f6ebf08c27437ecd';
const OC_CLIENT = PROFILE + '\\node_modules\\@xueayi\\dsh-opencode-go-usage\\lib\\client.js';
const POCKET_PROXY = PROFILE + '\\node_modules\\dsh-pocket\\lib\\proxy.mjs';

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

log('--- oc commit alive, arming in 12s ---');
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
        log('step3: pnpm patch-commit (opencode)');
        const out = execSync(`pnpm patch-commit "${STAGING}"`, { cwd: PROFILE, encoding: 'utf8', timeout: 480000 });
        log('  commit tail:\n' + out.split(/\r?\n/).slice(-8).join('\n  '));
      } catch (ex) {
        failed = true;
        log(`  commit FAILED: ${ex && (ex.message || ex)}`);
        if (ex && ex.stdout) log('  stdout tail:\n' + String(ex.stdout).split(/\r?\n/).slice(-8).join('\n  '));
      }
      const checks = {};
      try {
        checks.patchFile = fs.readdirSync(PROFILE + '\\patches').some((f) => f.startsWith('@xueayi+dsh-opencode-go-usage'));
      } catch { checks.patchFile = false; }
      try { checks.registered = fs.readFileSync(PROFILE + '\\pnpm-workspace.yaml', 'utf8').includes('dsh-opencode-go-usage'); } catch { checks.registered = false; }
      try { checks.ocGuard = fs.readFileSync(OC_CLIENT, 'utf8').includes('isMobile'); } catch { checks.ocGuard = false; }
      try { checks.pocketPatch = fs.readFileSync(POCKET_PROXY, 'utf8').includes('PHONE_DIAG_SCRIPT'); } catch { checks.pocketPatch = false; }
      log(`step4: verify ${JSON.stringify(checks)} pipeline_ok=${!failed}`);
      if (!checks.ocGuard || !checks.pocketPatch || !checks.patchFile || !checks.registered) failed = true;
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
        log(`step6: ${up && !failed ? 'SUCCESS: 3081 up, all patches applied' : up ? '3081 up BUT verify had failures' : 'TIMEOUT: 3081 not up - check dsh-restart-err.log'}`);
      });
    });
  });
}, 12000);
