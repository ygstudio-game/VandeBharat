const { spawn } = require('child_process');
const path = require('path');

function run(cmd, args, cwd, label) {
  const proc = spawn(cmd, args, {
    cwd,
    shell: true,
    stdio: 'pipe',
  });
  proc.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  proc.on('close', (code) => console.log(`[${label}] exited with code ${code}`));
  return proc;
}

const backend = run('node', ['src/index.js'], path.join(__dirname, 'backend'), 'backend');
const frontend = run('npm', ['run', 'dev'], path.join(__dirname, 'frontend'), 'frontend');

process.on('SIGINT', () => {
  backend.kill();
  frontend.kill();
  process.exit(0);
});
