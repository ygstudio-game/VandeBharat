/**
 * DevLab startup — kills stale processes on ports 8002 + 5174 before starting.
 * Backend: nodemon (auto-restarts on file changes)
 * Frontend: vite --port 5174
 */
'use strict';

const { spawn, exec } = require('child_process');
const path = require('path');

const WIN = process.platform === 'win32';

// Kill whatever is occupying a port before we try to bind it
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
          exec(`taskkill /PID ${pid} /F`, () => {
            if (++done === pids.size) resolve();
          });
        });
      });
    } else {
      exec(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, () => resolve());
    }
  });
}

function run(cmd, args, cwd, label) {
  const proc = spawn(cmd, args, { cwd, shell: true, stdio: 'pipe' });
  proc.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  proc.on('close', (code) => console.log(`[${label}] exited with code ${code}`));
  return proc;
}

async function main() {
  console.log('[devlab] Freeing ports 8002 and 5174...');
  await Promise.all([killPort(8002), killPort(5174)]);
  console.log('[devlab] Ports clear — starting services...');

  const backend  = run('npx', ['nodemon', 'src/index.js'], path.join(__dirname, 'backend'),  'backend');
  const frontend = run('npm', ['run', 'dev'],               path.join(__dirname, 'frontend'), 'frontend');

  process.on('SIGINT', () => {
    backend.kill();
    frontend.kill();
    process.exit(0);
  });
}

main();
