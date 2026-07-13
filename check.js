'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const WIN  = process.platform === 'win32';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red:   '\x1b[31m', green: '\x1b[32m',
  yellow:'\x1b[33m', cyan:  '\x1b[36m',
};

let pass = 0, fail = 0, warn = 0;

function ok(msg)  { console.log(`  ${C.green}[OK]  ${C.reset} ${msg}`); pass++; }
function bad(msg) { console.log(`  ${C.red}[FAIL]${C.reset} ${msg}`); fail++; }
function wn(msg)  { console.log(`  ${C.yellow}[WARN]${C.reset} ${msg}`); warn++; }
function hdr(msg) { console.log(`\n${C.bold}[ ${msg} ]${C.reset}`); }

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function pyExe(dir) {
  return path.join(ROOT, dir, 'venv', WIN ? 'Scripts/python.exe' : 'bin/python');
}

function pipHas(exe, pkg) {
  try { execSync(`"${exe}" -m pip show ${pkg}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function pyRun(exe, code) {
  try { return execSync(`"${exe}" -c "${code}"`, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); }
  catch { return null; }
}

function inPath(cmd) {
  try { execSync(`where ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// ── System tools ──────────────────────────────────────────────────────────
hdr('System Tools');
inPath('python') ? ok('python in PATH') : bad('python not in PATH — install Python 3.10+');
inPath('node')   ? ok('node in PATH')   : bad('node not in PATH — install Node.js 18+');
inPath('npm')    ? ok('npm in PATH')    : bad('npm not in PATH');

// ── Virtual environments ───────────────────────────────────────────────────
hdr('Virtual Environments');
const VENV_DIRS = [
  'GPU/yolo', 'GPU/ocr',
  'services/frame_extractor', 'services/sync_engine',
  'services/correlation',     'services/report_generator',
];
for (const dir of VENV_DIRS) {
  const exe = pyExe(dir);
  fs.existsSync(exe) ? ok(`${dir}/venv`) : bad(`${dir}/venv  -- run setup.bat`);
}

// ── Python packages per service ───────────────────────────────────────────
const SERVICES = [
  {
    label: 'GPU/yolo',
    dir:   'GPU/yolo',
    pkgs:  ['fastapi','uvicorn','python-multipart','ultralytics',
            'opencv-python-headless','requests','psycopg2-binary',
            'cloudinary','python-dotenv'],
  },
  {
    label: 'GPU/ocr',
    dir:   'GPU/ocr',
    pkgs:  ['fastapi','uvicorn','rapidocr','onnxruntime','opencv-python-headless',
            'requests','psycopg2-binary','cloudinary','python-dotenv'],
  },
  {
    label: 'services/frame_extractor',
    dir:   'services/frame_extractor',
    pkgs:  ['fastapi','uvicorn','opencv-python-headless','cloudinary',
            'psycopg2-binary','python-dotenv','requests'],
  },
  {
    label: 'services/sync_engine',
    dir:   'services/sync_engine',
    pkgs:  ['fastapi','uvicorn','psycopg2-binary','python-dotenv','numpy'],
  },
  {
    label: 'services/correlation',
    dir:   'services/correlation',
    pkgs:  ['fastapi','uvicorn','psycopg2-binary','python-dotenv','requests'],
  },
  {
    label: 'services/report_generator',
    dir:   'services/report_generator',
    pkgs:  ['fastapi','uvicorn','fpdf2','cloudinary',
            'psycopg2-binary','python-dotenv','requests','Pillow'],
  },
];

for (const svc of SERVICES) {
  hdr(`${svc.label}  packages`);
  const exe = pyExe(svc.dir);
  if (!fs.existsSync(exe)) {
    console.log('  [SKIP]  venv missing — run setup.bat first');
    continue;
  }
  for (const pkg of svc.pkgs) {
    pipHas(exe, pkg) ? ok(pkg) : bad(`${pkg}  -- NOT installed (run setup.bat)`);
  }
}

// ── GPU packages (optional) ───────────────────────────────────────────────
hdr('GPU Packages  (optional — needed for real inference)');

const yoloPy = pyExe('GPU/yolo');
if (fs.existsSync(yoloPy)) {
  const r = pyRun(yoloPy, 'import torch; print(torch.__version__, torch.cuda.is_available())');
  if (r) {
    const [ver, cuda] = r.split(' ');
    ok(`torch ${ver}  |  CUDA available: ${cuda}`);
  } else {
    wn('torch NOT installed in GPU/yolo/venv  (GPU inference will fail)');
  }
} else {
  console.log('  [SKIP]  GPU/yolo venv missing');
}

const ocrPy = pyExe('GPU/ocr');
if (fs.existsSync(ocrPy)) {
  const r = pyRun(ocrPy, 'import onnxruntime; print(onnxruntime.__version__)');
  if (r) {
    ok(`onnxruntime ${r}`);
  } else {
    wn('onnxruntime NOT installed in GPU/ocr/venv  (GPU inference will fail)');
  }
} else {
  console.log('  [SKIP]  GPU/ocr venv missing');
}

// ── Node modules ───────────────────────────────────────────────────────────
hdr('Node.js  node_modules');
exists('backend/node_modules')  ? ok('backend/node_modules')  : bad('backend/node_modules  -- run: npm install inside backend/');
exists('frontend/node_modules') ? ok('frontend/node_modules') : bad('frontend/node_modules -- run: npm install inside frontend/');

// ── YOLO model files ───────────────────────────────────────────────────────
hdr('YOLO Model Files  ( GPU/yolo/models/ )');
exists('GPU/yolo/models/best.pt')
  ? ok('best.pt')
  : wn('best.pt  -- not here yet  (defect detection will return 503)');
exists('GPU/yolo/models/train_num_detector.pt')
  ? ok('train_num_detector.pt')
  : wn('train_num_detector.pt  -- not here yet  (OCR ROI will return 503)');

// ── .env files ─────────────────────────────────────────────────────────────
hdr('.env Files');
exists('backend/.env')                   ? ok('backend/.env')                   : bad('backend/.env  -- MISSING  (DB_URL, CLOUDINARY_*)');
exists('services/frame_extractor/.env')  ? ok('services/frame_extractor/.env')  : bad('services/frame_extractor/.env  -- MISSING  (DB_URL, CLOUDINARY_*)');
exists('services/report_generator/.env') ? ok('services/report_generator/.env') : bad('services/report_generator/.env  -- MISSING  (DB_URL, CLOUDINARY_*)');
exists('GPU/yolo/.env') ? ok('GPU/yolo/.env') : wn('GPU/yolo/.env  -- optional, not present');
exists('GPU/ocr/.env')  ? ok('GPU/ocr/.env')  : wn('GPU/ocr/.env   -- optional, not present');

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(52));
console.log('  Summary');
console.log('='.repeat(52));
console.log(`  ${C.green}PASS${C.reset} : ${pass}`);
console.log(`  ${C.yellow}WARN${C.reset} : ${warn}  (non-blocking -- GPU packages or optional files)`);
console.log(`  ${C.red}FAIL${C.reset} : ${fail}  (must fix before starting)`);
console.log();
if (fail === 0 && warn === 0) {
  console.log(`  ${C.green}${C.bold}All good!  Run:  node start.js${C.reset}`);
} else if (fail === 0) {
  console.log(`  ${C.yellow}Core OK.  Fix WARNs above for full GPU inference.${C.reset}`);
  console.log('  Then run:  node start.js');
} else {
  console.log(`  ${C.red}Fix the FAIL items above, then re-run check.bat.${C.reset}`);
  console.log('  Missing packages?  Run setup.bat first.');
}
console.log();
