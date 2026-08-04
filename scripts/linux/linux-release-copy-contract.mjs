export const LINUX_EXPERIMENTAL_LABEL = 'Linux (Experimental)';

export function assertLinuxExperimentalReleaseCopy(body, identity) {
  if (!identity.intent.selectedPlatforms.includes('linux')) return body;
  if (!String(body ?? '').includes(LINUX_EXPERIMENTAL_LABEL)) {
    throw new Error(`Linux release copy must identify the platform as ${LINUX_EXPERIMENTAL_LABEL}.`);
  }
  return body;
}
