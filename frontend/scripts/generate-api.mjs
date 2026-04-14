import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Generates a typed API client into src/lib/api/generated
// Source: backend swagger JSON at http://localhost:3000/api/docs-json

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'src', 'lib', 'api', 'generated');
const specFile = path.join(root, 'openapi.json');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log(`Generating OpenAPI client -> ${outDir}`);

const inputUrl = 'http://localhost:3000/api/docs-json';
const codegenBin = path.join(root, 'node_modules', 'openapi-typescript-codegen', 'bin', 'index.js');

// Fetch the spec to a local file first.
// This avoids URL resolution quirks with some ref-parser setups on Windows.
if (process.platform === 'win32') {
  // Use curl.exe explicitly on Windows. Invoking "curl" via cmd can pick up aliases/tools
  // that behave differently and may return exit code 3 (URL format error).
  execFileSync('curl.exe', ['-s', inputUrl, '-o', specFile], { stdio: 'inherit', cwd: root });
} else {
  // POSIX: use argv array
  execFileSync('curl', ['-s', inputUrl, '-o', specFile], { stdio: 'inherit', cwd: root });
}

// Run the generator directly from node_modules (more reliable than npx on Windows).
execFileSync(process.execPath, [codegenBin, '-i', specFile, '-o', outDir, '-c', 'axios'], {
  stdio: 'inherit',
  cwd: root,
});
console.log('Done.');

