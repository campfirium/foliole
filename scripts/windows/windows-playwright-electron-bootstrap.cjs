'use strict';

const { app } = require('electron');

app.commandLine.appendSwitch('remote-debugging-port', '0');
