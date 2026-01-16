import fs from 'node:fs';
import path from 'node:path';

// Windows-friendly "rm -rf" for Next build artifacts.
// We intentionally remove the whole `.next/` folder to avoid Turbopack typegen conflicts
// like "Duplicate identifier 'PagesPageConfig'".
const target = path.join(process.cwd(), '.next');

try {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
} catch {
  // If cleanup fails for any reason, we still let the build try to run.
}

