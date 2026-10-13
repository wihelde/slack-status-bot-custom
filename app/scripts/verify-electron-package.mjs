import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const appDir = path.resolve(new URL('..', import.meta.url).pathname);
const packageJson = require(path.join(appDir, 'package.json'));
const expectedMain = packageJson.main;
const packagePath = process.argv[2] || path.join(
  appDir,
  'dist',
  'mac-arm64',
  `${packageJson.build.productName}.app`,
  'Contents',
  'Resources',
  'app.asar'
);
const packagedFiles = new Set(asar.listPackage(packagePath));

const packagedPackageJson = JSON.parse(
  asar.extractFile(packagePath, 'package.json').toString('utf-8')
);

if (packagedPackageJson.main !== expectedMain) {
  throw new Error(
    `Expected packaged app main to be ${expectedMain}, received ${packagedPackageJson.main}`
  );
}

for (const requiredFile of [
  expectedMain, 'dist/preload.js', 'dist/main/ipcHandlers.js', 'build/index.html',
  'node_modules/axios/package.json', 'node_modules/electron-updater/package.json',
]) {
  if (!packagedFiles.has(`/${requiredFile}`)) {
    throw new Error(`Missing required packaged file: ${requiredFile}`);
  }
}

console.log(`Packaged Electron main verified: ${packagedPackageJson.main}`);
