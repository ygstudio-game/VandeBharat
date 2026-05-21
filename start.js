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

const { spawn } = require('child_process');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

const ROOT    = __dirname;
const WIN     = process.platform === 'win32';
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'combined.log');

// Clear log file on every startup
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, `=== VandeInspect AI — started ${new Date().toISOString()} ===\n`);
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

const SERVICES = [
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
    waitMs:  30_000,
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
    `│  VandeInspect AI  —  Startup             │\n` +
    `│  ${SERVICES.length} services, sequential health-gated  │\n` +
    `└──────────────────────────────────────────┘` +
    `${C.reset}\n`
  );

  for (const svc of SERVICES) {
    try {
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
    `  YOLO       →  http://localhost:5002/health\n` +
    `  OCR        →  http://localhost:5000/health\n` +
    `  Frame Ext  →  http://localhost:5003/health\n` +
    `  Sync Eng   →  http://localhost:5004/health\n` +
    `  Correlate  →  http://localhost:5005/health\n` +
    `  Report Gen →  http://localhost:5006/health\n` +
    `\n${C.gray}Ctrl+C to stop everything.${C.reset}\n`
  );
}

process.on('SIGINT',  () => { killAll('Ctrl+C');   logStream.end(); process.exit(0); });
process.on('SIGTERM', () => { killAll('SIGTERM');   logStream.end(); process.exit(0); });

main().catch((err) => {
  log('ORCHESTRATOR', C.red, err.message);
  killAll('unhandled error');
  process.exit(1);
});
