import fs from 'fs';
import path from 'path';

const appDir = path.resolve(new URL('..', import.meta.url).pathname);
const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf-8'));
const expectedMain = 'dist/electron.js';
const requiredOutputs = [
  path.join(appDir, 'dist', 'electron.js'),
  path.join(appDir, 'dist', 'preload.js'),
  path.join(appDir, 'dist', 'main', 'ipcHandlers.js'),
];

if (packageJson.main !== expectedMain) {
  throw new Error(`Expected package.json main to be ${expectedMain}, received ${packageJson.main}`);
}

for (const outputPath of requiredOutputs) {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Missing compiled host output: ${outputPath}`);
  }
}

console.log('Electron host build outputs verified.');
