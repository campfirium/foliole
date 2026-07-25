#!/usr/bin/env node
/* global process */

import fs from 'node:fs';

const prompt = process.argv.slice(2).join(' ').toLowerCase();
if (prompt.includes('username')) process.stdout.write('x-access-token');
else process.stdout.write(fs.readFileSync(process.env.FOLIOLE_WINDOWS_ANDROID_LAB_GIT_TOKEN, 'utf8').trim());
