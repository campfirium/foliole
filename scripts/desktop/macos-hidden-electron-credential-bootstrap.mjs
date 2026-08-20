/* global process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { app } from 'electron';

const appName = process.env.FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME?.trim();
const mainPath = process.env.FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH?.trim();

if (!appName?.match(/^Foliole Hidden Native [a-f0-9]{20}$/u)
    || !mainPath || !path.isAbsolute(mainPath)) {
  throw new Error('macos_hidden_electron_credential_bootstrap_invalid');
}

await import(pathToFileURL(mainPath).href);
if (app.isReady()) throw new Error('macos_hidden_electron_credential_identity_too_late');
app.setName(appName);
if (app.getName() !== appName) throw new Error('macos_hidden_electron_credential_identity_rejected');
