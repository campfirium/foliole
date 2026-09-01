import {
  deletePublishDeviceSecret as deleteDeviceSecret,
  hasPublishDeviceSecret as hasDeviceSecret,
  readPublishDeviceSecret as readDeviceSecret,
  writePublishDeviceSecret as writeDeviceSecret
} from '../security/publishDeviceSecretStore.js';

const SECRET_LABEL = 'Foliole Aide model API key';
const sessionSecrets = new Map<string, string>();

export function hasFolioleAideModelSecret(file: string) {
  const exists = hasDeviceSecret(file);
  if (!exists) sessionSecrets.delete(file);
  return exists;
}

export function readFolioleAideModelSecret(file: string) {
  if (!hasFolioleAideModelSecret(file)) return '';
  const cached = sessionSecrets.get(file);
  if (cached !== undefined) return cached;
  const value = readDeviceSecret(file, SECRET_LABEL);
  sessionSecrets.set(file, value);
  return value;
}

export function writeFolioleAideModelSecret(file: string, value: string) {
  if (sessionSecrets.get(file) === value && hasFolioleAideModelSecret(file)) return;
  writeDeviceSecret(file, SECRET_LABEL, value);
  sessionSecrets.set(file, value);
}

export function deleteFolioleAideModelSecret(file: string) {
  const deleted = deleteDeviceSecret(file);
  sessionSecrets.delete(file);
  return deleted;
}
