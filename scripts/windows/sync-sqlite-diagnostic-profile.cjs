const process = require('node:process');
const { setInterval } = require('node:timers');
const fs = require('node:fs');
const path = require('node:path');
const inspector = require('node:inspector');

exports.start = function (root, emit) {
  const session = new inspector.Session();
  session.connect();
  let sequence = 0;
  let collecting = false;
  session.post('Profiler.enable');
  session.post('Profiler.setSamplingInterval', { interval: 10000 });
  session.post('Profiler.start');
  // Periodic samples preserve executing call stacks even if the test later times out.
  setInterval(() => {
    if (collecting) return;
    collecting = true;
    session.post('Profiler.stop', (error, result) => {
      if (error) emit({ event: 'profile_error', error: error.message });
      else fs.writeFileSync(path.join(root, `cpu-${process.pid}-${sequence++}.cpuprofile`), JSON.stringify(result.profile));
      session.post('Profiler.start');
      collecting = false;
    });
  }, 10000).unref();
};
