'use strict';

const fs = require('node:fs');
const process = require('node:process');
const modern = require('glob');
const { braceExpand } = require('minimatch');

function optionsFor(options) {
  return { ...options, windowsPathsNoEscape: process.platform === 'win32' };
}

function matchSync(pattern, options = {}) {
  if (!options.nonull) return modern.globSync(pattern, optionsFor(options));
  return [...new Set(braceExpand(pattern, options).flatMap(expanded => {
    const matches = modern.globSync(expanded, optionsFor(options));
    return matches.length ? matches : [expanded];
  }))];
}

async function match(pattern, options = {}) {
  if (!options.nonull) return modern.glob(pattern, optionsFor(options));
  const matches = await Promise.all(braceExpand(pattern, options).map(async expanded => {
    const found = await modern.glob(expanded, optionsFor(options));
    return found.length ? found : [expanded];
  }));
  return [...new Set(matches.flat())];
}

function callbackResult(promise, callback) {
  if (!callback) return promise;
  promise.then(value => callback(null, value), callback);
}

function glob(pattern, options, callback) {
  if (typeof options === 'function') return callbackResult(match(pattern), options);
  return callbackResult(match(pattern, options), callback);
}

function targetsSync(target, options) {
  try {
    fs.lstatSync(target);
    return [target];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (options.disableGlob || options.glob === false || !modern.hasMagic(target, { magicalBraces: true })) return [target];
    return matchSync(target, options.glob || {});
  }
}

async function targets(target, options) {
  try {
    await fs.promises.lstat(target);
    return [target];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (options.disableGlob || options.glob === false || !modern.hasMagic(target, { magicalBraces: true })) return [target];
    return match(target, options.glob || {});
  }
}

function removalOptions(options) {
  return { recursive: true, force: true, maxRetries: options.maxBusyTries ?? 3 };
}

function removeSync(target, options = {}) {
  for (const file of targetsSync(target, options)) fs.rmSync(file, removalOptions(options));
}

async function remove(target, options) {
  for (const file of await targets(target, options)) await fs.promises.rm(file, removalOptions(options));
}

function rimraf(target, options, callback) {
  if (typeof options === 'function') return callbackResult(remove(target, {}), options);
  return callbackResult(remove(target, options || {}), callback);
}

glob.sync = matchSync;
rimraf.sync = removeSync;
module.exports = { glob, rimraf };
