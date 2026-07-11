#!/usr/bin/env node
/**
 * VandeInspect AI — Sequential Startup Orchestrator
 *
 * Starts all 8 services in dependency order.
 * Each service must pass its /health check before the next one starts.
 * If any service fails to start or crashes, everything is killed.
 *
 * Usage:
 *   node start.js          (or: npm start)
 */
'use strict';

const { spawn, exec } = require('child_process');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const { Supervisor, createService } = require('./backend/src/supervisor');  // D2

const ROOT    = __dirname;
const WIN     = process.platform === 'win32';
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'combined.log');

// Clear log file on every startup
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, `=== RDSO_MVIS — started ${new Date().toISOString()} ===\n`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// ── Colours ────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m',  green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', gray: '\x1b[90m',
};

// ── Service definitions — start order IS the dependency order ───────────────
//   `cmd` is relative to the service's own dir (cwd), so venv python resolves correctly
const PY = WIN
  ? path.join('venv', 'Scripts', 'python.exe')
  : path.join('venv', 'bin', 'python');

function servicePython(dir, fallbackDir) {
  const primary = path.join(dir, PY);
  if (fs.existsSync(path.join(ROOT, primary))) return path.join(ROOT, primary);
  if (fallbackDir) {
    const fallback = path.join(fallbackDir, PY);
    if (fs.existsSync(path.join(ROOT, fallback))) return path.join(ROOT, fallback);
  }
  return PY;
}

const INGESTION_PY = servicePython('services/ingestion', 'services/frame_extractor');

const SERVICES = [
  // ── Edge ingestion publisher ───────────────────────────────────────────────
  {
    name:    'INGESTION',
    color:   C.cyan,
    dir:     'services/ingestion',
    cmd:     INGESTION_PY,
    args:    ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '5007'],
    port:    5007,
    health:  '/health',
    waitMs:  30_000,
  },

  // ── GPU services first (model warm-up is slow, give them 120 s) ──────────
  {
    name:    'YOLO',
    color:   C.yellow,
    dir:     'GPU/yolo',
    cmd:     PY,
    args:    ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '5002'],
    port:    5002,
    health:  '/health',
    waitMs:  120_000,
  },
  {
    name:    'OCR',
    color:   C.magenta,
    dir:     'GPU/ocr',
    cmd:     PY,
    // OCR depends on YOLO for ROI — starts after YOLO is healthy
    args:    ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '5000'],
    port:    5000,
    health:  '/health',
    waitMs:  120_000,
  },

  // ── CPU pipeline workers ─────────────────────────────────────────────────
  {
    name:    'FRAME-EXT',
    color:   C.cyan,
    dir:     'services/frame_extractor',
    cmd:     PY,
    args:    ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '5003'],
    port:    5003,
    health:  '/health',
    waitMs:  30_000,
  },
  {
    name:    'SYNC-ENG',
    color:   C.blue,
    dir:     'services/sync_engine',
    cmd:     PY,
    args:    ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '5004'],
    port:    5004,
    health:  '/health',
    waitMs:  30_000,
  },
  {
    name:    'CORRELATE',
    color:   C.white,
    dir:     'services/correlation',
    cmd:     PY,
    args:    ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '5005'],
    port:    5005,
    health:  '/health',
    waitMs:  60_000,
  },
  {
    name:    'REPORT-GEN',
    color:   C.green,
    dir:     'services/report_generator',
    cmd:     PY,
    args:    ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '5006'],
    port:    5006,
    health:  '/health',
    waitMs:  30_000,
  },

  // ── Node.js backend (starts after all Python services are up) ────────────
  {
    name:    'BACKEND',
    color:   C.blue,
    dir:     'backend',
    cmd:     WIN ? 'node.exe' : 'node',
    inPath:  true,   // resolved from PATH, not relative to service dir
    args:    ['run.js'],
    port:    8001,
    health:  '/health',
    waitMs:  30_000,
  },

  // ── Frontend (Vite — no /health endpoint, just give it time) ─────────────
  {
    name:    'FRONTEND',
    color:   C.green,
    dir:     'frontend',
    cmd:     'npm',
    inPath:  true,   // resolved from PATH, not relative to service dir
    shell:   true,   // npm is a .cmd batch file on Windows — needs shell
    args:    ['run', 'dev'],
    port:    5173,
    health:  null,     // Vite dev server has no /health route
    waitMs:  8_000,    // just wait 8 s then consider it up
  },
];

const INFRA = [
  {
    name:    'MAILHOG',
    color:   C.magenta,
    dir:     '.',
    cmd:     WIN ? 'docker.exe' : 'docker',
    inPath:  true,
    args:    ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', 'mailhog'],
    port:    8025,
    health:  '/api/v2/messages',
    waitMs:  30_000,
  },
];

// ── Runtime state ─────────────────────────────────────────────────────────
const running  = [];   // { name, proc }
let   shutting = false;

// ── Logging ──────────────────────────────────────────────────────────────
// Strip ANSI escape codes for the file (keep console coloured)
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function log(name, color, msg) {
  const label = `${color}${C.bold}[${name.padEnd(12)}]${C.reset}`;
  process.stdout.write(`${label} ${msg}\n`);
  // Write plain text to file — timestamp + label + message
  const ts    = new Date().toISOString();
  const plain = `${ts} [${name.padEnd(12)}] ${msg.replace(ANSI_RE, '')}\n`;
  logStream.write(plain);
}

// ── Shutdown — kill all in reverse start order ────────────────────────────
function killAll(reason) {
  if (shutting) return;
  shutting = true;
  log('ORCHESTRATOR', C.red, `shutting down — ${reason}`);
  for (const { name, proc } of [...running].reverse()) {
    try {
      if (WIN) {
        // taskkill /T kills the whole process tree (uvicorn workers included)
        spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-proc.pid, 'SIGTERM');
      }
      log(name, C.red, `killed (PID ${proc.pid})`);
    } catch (_) { /* already dead */ }
  }
}

// ── Health polling ────────────────────────────────────────────────────────
function pollHealth(port, urlPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      if (Date.now() > deadline) {
        return reject(new Error(
          `health check :${port}${urlPath} timed out after ${timeoutMs / 1000}s`
        ));
      }
      const req = http.get(
        { hostname: '127.0.0.1', port, path: urlPath, timeout: 3000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve();
          setTimeout(attempt, 2000);
        }
      );
      req.on('error',   () => setTimeout(attempt, 2000));
      req.on('timeout', () => { req.destroy(); setTimeout(attempt, 2000); });
    }

    attempt();
  });
}

// ── Single-shot health probe (used by the supervisor watchdog) ────────────
function probeHealth(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: urlPath, timeout: 3000 },
      (res) => { res.resume(); resolve(res.statusCode === 200); }
    );
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ensureInfraReady(svc) {
  log(svc.name, svc.color, 'ensuring development infra is running…');
  await new Promise((resolve, reject) => {
    const cwd = path.join(ROOT, svc.dir);
    const proc = spawn(svc.cmd, svc.args, {
      cwd,
      stdio: 'pipe',
      shell: svc.shell ?? false,
      windowsHide: true,
    });

    let stderr = '';
    proc.stdout.on('data', (buf) => {
      buf.toString().trimEnd().split('\n').filter(Boolean)
        .forEach((line) => log(svc.name, svc.color, line));
    });
    proc.stderr.on('data', (buf) => {
      const text = buf.toString();
      stderr += text;
      text.trimEnd().split('\n').filter(Boolean)
        .forEach((line) => log(svc.name, C.gray, line));
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${svc.name} bootstrap failed (code=${code}): ${stderr.trim()}`));
    });
  });

  if (svc.health) {
    await pollHealth(svc.port, svc.health, svc.waitMs);
    log(svc.name, svc.color, `${C.green}✓ ready${C.reset}`);
  }
}

// ── Supervisor restart: kill the dead service's proc, free its port, respawn ──
async function restartService(svc) {
  log(svc.name, svc.color, `${C.yellow}supervisor: restarting…${C.reset}`);
  const idx = running.findIndex((r) => r.name === svc.name);
  if (idx >= 0) {
    const { proc } = running[idx];
    try {
      if (WIN) spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-proc.pid, 'SIGTERM');
    } catch (_) { /* already dead */ }
    running.splice(idx, 1);
  }
  await killPort(svc.port);
  launch(svc);   // re-adds to running[]
}

// ── Spawn a service process ───────────────────────────────────────────────
function launch(svc) {
  const cwd = path.join(ROOT, svc.dir);

  // venv python is relative to the service dir; node/npm come from PATH (inPath: true)
  const exe = (path.isAbsolute(svc.cmd) || svc.inPath)
    ? svc.cmd
    : path.join(cwd, svc.cmd);

  const proc = spawn(exe, svc.args, {
    cwd,
    stdio:       'pipe',
    shell:       svc.shell ?? false,
    detached:    !WIN,
    windowsHide: true,
  });

  running.push({ name: svc.name, proc });

  proc.stdout.on('data', (buf) =>
    buf.toString().trimEnd().split('\n')
      .forEach(line => log(svc.name, svc.color, line))
  );
  proc.stderr.on('data', (buf) =>
    buf.toString().trimEnd().split('\n')
      // uvicorn INFO messages arrive on stderr — print them in dim colour
      .forEach(line => log(svc.name, C.gray, line))
  );

  proc.on('error', (err) => {
    if (!shutting) {
      killAll(`${svc.name} spawn error — ${err.message}`);
      process.exit(1);
    }
  });

  return proc;
}

// ── Kill any process occupying a port ────────────────────────────────────
function killPort(port) {
  return new Promise((resolve) => {
    if (WIN) {
      exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
        if (err || !stdout) return resolve();
        const pids = new Set();
        stdout.trim().split('\n').forEach((line) => {
          if (line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') pids.add(pid);
          }
        });
        if (!pids.size) return resolve();
        let done = 0;
        pids.forEach((pid) => {
          exec(`taskkill /PID ${pid} /F`, () => { if (++done === pids.size) resolve(); });
        });
      });
    } else {
      exec(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, () => resolve());
    }
  });
}

// ── Start one service and wait for it to be ready ────────────────────────
async function startService(svc) {
  log(svc.name, svc.color, `starting on port ${svc.port}…`);
  const proc = launch(svc);

  // Rejects if the process dies before we declare it healthy
  const died = new Promise((_, reject) => {
    proc.once('exit', (code, sig) => {
      if (!shutting) {
        reject(new Error(
          `${svc.name} exited unexpectedly (code=${code ?? 'null'}, signal=${sig ?? 'none'})`
        ));
      }
    });
  });

  if (!svc.health) {
    // No health endpoint — just wait the configured time, then continue
    await Promise.race([
      new Promise(r => setTimeout(r, svc.waitMs)),
      died,
    ]);
    log(svc.name, svc.color, `${C.green}started (no health check)${C.reset}`);
    return;
  }

  log(svc.name, svc.color, `waiting for health check at :${svc.port}${svc.health}…`);
  await Promise.race([
    pollHealth(svc.port, svc.health, svc.waitMs),
    died,
  ]);
  log(svc.name, svc.color, `${C.green}✓ healthy${C.reset}`);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `\n${C.bold}${C.cyan}` +
    `┌──────────────────────────────────────────┐\n` +
    `│  RDSO_MVIS  —  Startup                   │\n` +
    `│  ${SERVICES.length} services, sequential health-gated  │\n` +
    `└──────────────────────────────────────────┘` +
    `${C.reset}\n`
  );

  for (const svc of INFRA) {
    try {
      await ensureInfraReady(svc);
    } catch (err) {
      log(svc.name, C.yellow, `skipping optional infra — ${err.message}`);
    }
  }

  for (const svc of SERVICES) {
    try {
      // Free the port before starting each service so stale processes never block startup
      log('ORCHESTRATOR', C.gray, `freeing port ${svc.port} before starting ${svc.name}…`);
      await killPort(svc.port);
      await startService(svc);
    } catch (err) {
      log('ORCHESTRATOR', C.red, `${C.bold}ABORT — ${err.message}${C.reset}`);
      killAll(err.message);
      process.exit(1);
    }
  }

  console.log(
    `\n${C.bold}${C.green}All services online.${C.reset}\n` +
    `  Frontend   →  http://localhost:5173\n` +
    `  Backend    →  http://localhost:8001\n` +
    `  Ingestion  →  http://localhost:5007/health\n` +
    `  YOLO       →  http://localhost:5002/health\n` +
    `  OCR        →  http://localhost:5000/health\n` +
    `  Frame Ext  →  http://localhost:5003/health\n` +
    `  Sync Eng   →  http://localhost:5004/health\n` +
    `  Correlate  →  http://localhost:5005/health\n` +
    `  Report Gen →  http://localhost:5006/health\n` +
    `  MailHog    →  http://localhost:8025\n` +
    `\n${C.gray}Ctrl+C to stop everything.${C.reset}\n`
  );

  // ── D2 supervisor — opt-in watchdog: auto-restart dead/hung services ───────
  if (process.env.SUPERVISE === '1') {
    const sup = new Supervisor();
    for (const svc of SERVICES) {
      if (!svc.health) continue;   // skip services without a /health endpoint (frontend)
      sup.add(createService({
        name:          svc.name,
        probe:         () => probeHealth(svc.port, svc.health),
        restart:       () => restartService(svc),
        failThreshold: Number(process.env.SUPERVISE_FAILS || 2),
        graceMs:       svc.waitMs,   // give a restarted service its full warmup before re-probing
      }));
    }
    const intervalMs = Number(process.env.SUPERVISE_INTERVAL_MS || 10_000);
    setInterval(() => {
      if (shutting) return;
      sup.tickAll().catch((e) => log('SUPERVISOR', C.red, e.message));
    }, intervalMs);
    log('SUPERVISOR', C.cyan, `watchdog active — probing /health every ${intervalMs / 1000}s`);
  } else {
    log('SUPERVISOR', C.gray, 'watchdog disabled (set SUPERVISE=1 to auto-restart crashed services)');
  }
}

process.on('SIGINT',  () => { killAll('Ctrl+C');   logStream.end(); process.exit(0); });
process.on('SIGTERM', () => { killAll('SIGTERM');   logStream.end(); process.exit(0); });

main().catch((err) => {
  log('ORCHESTRATOR', C.red, err.message);
  killAll('unhandled error');
  process.exit(1);
});
