'use strict';

/* global process */

if (process.type !== 'browser') {
  throw new Error('desktop_dnssd_harness_requires_electron_main');
}

module.exports = require('@foliole/desktop-dnssd');
