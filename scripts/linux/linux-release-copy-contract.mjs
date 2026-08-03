export const LINUX_EXPERIMENTAL_RELEASE_COPY = [
  'Linux Experimental supports Ubuntu 24.04 x64.',
  'Install the DEB package to use Foliole.',
  'Updates are manual: download and install each new DEB from this GitHub Release.',
  'A supported Wayland system selection shortcut is not included in this release; the in-app clip panel remains available.'
];

export function assertLinuxExperimentalReleaseCopy(body, identity) {
  if (!identity.intent.selectedPlatforms.includes('linux')) return body;
  for (const sentence of LINUX_EXPERIMENTAL_RELEASE_COPY) {
    if (!String(body ?? '').includes(sentence)) throw new Error(`Linux Experimental release copy must include: ${sentence}`);
  }
  if (/primary selection (?:is|remains) (?:unavailable|unreadable)/iu.test(body)) {
    throw new Error('Linux release copy must not claim that the primary selection is unreadable.');
  }
  return body;
}
