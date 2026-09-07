import {
  deletePublishDeviceSecret,
  hasPublishDeviceSecret,
  readPublishDeviceSecret,
  writePublishDeviceSecret
} from '../security/publishDeviceSecretStore.js';

const SECRET_LABEL = 'Readwise API token';
const SECRET_REF_PATTERN = /^readwise-api-[0-9a-f-]{36}\.bin$/u;

function assertSecretRef(secretRef: string) {
  if (!SECRET_REF_PATTERN.test(secretRef)) throw new Error('invalid_readwise_api_secret_ref');
}

export function hasReadwiseApiSecret(secretRef: string) {
  assertSecretRef(secretRef);
  return hasPublishDeviceSecret(secretRef);
}

export function readReadwiseApiSecret(secretRef: string) {
  assertSecretRef(secretRef);
  return readPublishDeviceSecret(secretRef, SECRET_LABEL);
}

export function writeReadwiseApiSecret(secretRef: string, token: string) {
  assertSecretRef(secretRef);
  writePublishDeviceSecret(secretRef, SECRET_LABEL, token);
}

export function deleteReadwiseApiSecret(secretRef: string) {
  assertSecretRef(secretRef);
  return deletePublishDeviceSecret(secretRef);
}
