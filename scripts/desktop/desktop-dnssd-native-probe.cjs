'use strict';

/* global clearTimeout, process, setTimeout */

const dnsSd = require('@foliole/desktop-dnssd');

const name = `FolioleNativeProbe-${Date.now().toString(36)}`;
const expected = { device_id: 'native-probe-device', group_id: 'native-probe-group',
  group_tag: 'native-probe-tag' };
let browser;
let registration;
let found = false;
let registered = false;
let lost = false;
let disposed = false;
let lateEvents = 0;
let timeout;

function matches(event) {
  return event.service?.name === name || event.service?.fqdn?.startsWith(`${name}.`);
}

function finish(code, message) {
  clearTimeout(timeout);
  registration?.stop();
  registration?.stop();
  browser?.stop();
  browser?.stop();
  disposed = true;
  setTimeout(() => {
    const status = code === 0 && lateEvents === 0 ? 'OK' : 'FAILED';
    process.stdout.write(`[desktop-dnssd-native-probe] status=${status} registered=${registered} found=${found} lost=${lost} late=${lateEvents} ${message}\n`);
    process.exit(code === 0 && lateEvents === 0 ? 0 : 1);
  }, 200);
}

function consumeBrowse(event) {
  if (disposed) { lateEvents += 1; return; }
  if (event.kind === 'error') return finish(1,
    `browse_error=${event.code}:${event.message}`);
  if (!matches(event)) return;
  if (event.kind === 'lost') {
    lost = true;
    return finish(registered && found ? 0 : 1, 'lifecycle=complete');
  }
  if (event.kind !== 'found' && event.kind !== 'changed') return;
  const service = event.service;
  found = service.port === 38649 && service.addresses.length > 0
    && Object.entries(expected).every(([key, value]) => service.txt[key] === value);
  if (found && registered) registration.stop();
}

function consumeRegistration(event) {
  if (disposed) { lateEvents += 1; return; }
  if (event.kind === 'error') return finish(1,
    `register_error=${event.code}:${event.message}`);
  if (event.kind !== 'registered') return;
  registered = true;
  if (found) registration.stop();
}

browser = dnsSd.browse({ domain: 'local.', type: '_foliole-sync._tcp' }, consumeBrowse);
registration = dnsSd.register({ domain: 'local.', name, port: 38649,
  txt: expected, type: '_foliole-sync._tcp' }, consumeRegistration);
timeout = setTimeout(() => finish(1,
  `timeout registered=${registered} found=${found} lost=${lost}`), 8_000);
