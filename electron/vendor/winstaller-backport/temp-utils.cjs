'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const process = require('node:process');
const { glob, rimraf } = require('./cleanup-patterns.cjs');

const directories = new Set();
const removalOptions = { recursive: true, force: true, maxRetries: 6 };
let cleanupRegistered = false;

function cleanupSync() {
  let count = 0;
  for (const directory of directories) {
    // Tracked names are literal, including when another process has removed them.
    fs.rmSync(directory, removalOptions);
    directories.delete(directory);
    count++;
  }
  return { files: 0, dirs: count };
}

async function cleanupDirectories() {
  let count = 0;
  for (const directory of [...directories]) {
    await fs.promises.rm(directory, removalOptions);
    directories.delete(directory);
    count++;
  }
  return { files: 0, dirs: count };
}

function cleanup(callback) {
  const result = cleanupDirectories();
  if (!callback) return result;
  result.then(value => callback(null, value), callback);
}

function registerCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.on('exit', () => {
    for (const directory of directories) {
      try {
        fs.rmSync(directory, removalOptions);
      } catch {
        // Preserve upstream's best-effort process-exit cleanup.
      }
    }
  });
}

async function createTempDir(prefix) {
  registerCleanup();
  const options = typeof prefix === 'string' ? { prefix } : prefix || {};
  const directory = await fs.promises.mkdtemp(path.join(options.dir || os.tmpdir(), options.prefix || 'd-'));
  directories.add(directory);
  return directory;
}

module.exports = { createTempDir, cleanupSync, cleanup, glob, rimraf };
