const childProcess = require('node:child_process');
const process = require('node:process');
const { syncBuiltinESMExports } = require('node:module');

// Electron can disable NODE_OPTIONS; pass the diagnostic explicitly to child runtimes.
exports.install = function (preload) {
  for (const method of ['spawn', 'spawnSync']) {
    const original = childProcess[method];
    childProcess[method] = function (command, args, options) {
      const next = command === process.execPath && Array.isArray(args) && !args.includes(preload)
        ? ['--require', preload, ...args] : args;
      return Reflect.apply(original, this, [command, next, options]);
    };
  }
  const fork = childProcess.fork;
  childProcess.fork = function (file, args, options = {}) {
    const execArgv = options.execArgv ?? process.execArgv;
    return Reflect.apply(fork, this, [file, args, { ...options,
      execArgv: execArgv.includes(preload) ? execArgv : ['--require', preload, ...execArgv] }]);
  };
  syncBuiltinESMExports();
};
