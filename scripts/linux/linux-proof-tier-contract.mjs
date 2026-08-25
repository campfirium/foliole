export const LINUX_DEB_PROOF_CONTRACT = Object.freeze([
  {
    id: 'acceptance-network-isolation-controller',
    tier: 'repository',
    owner: 'scripts/linux/accept-linux-deb.test.mjs'
  },
  {
    id: 'acceptance-observer-interface-controller',
    tier: 'repository',
    owner: 'scripts/linux/accept-linux-deb.test.mjs'
  },
  {
    id: 'desktop-mdns-advertises-external-ipv4',
    tier: 'hosted-contract',
    owner: 'electron/sync/companionMdnsAdvertisement.test.ts'
  },
  {
    id: 'desktop-mdns-subscribes-external-ipv4',
    tier: 'hosted-contract',
    owner: 'electron/sync/desktopSyncGroupAutoSync.test.ts'
  },
  {
    id: 'deb-artifact-metadata-and-contents',
    tier: 'package-install',
    owner: 'scripts/linux/accept-linux-deb.mjs'
  },
  {
    id: 'deb-install-reinstall-uninstall',
    tier: 'package-install',
    owner: 'scripts/linux/accept-linux-deb.mjs'
  },
  {
    id: 'installed-runtime-external-capabilities',
    tier: 'package-install',
    owner: 'tests/desktop/linux-deb-external-capabilities.spec.ts'
  }
]);

const TIERS = new Set(['repository', 'hosted-contract', 'package-install']);

export function assertLinuxDebProofContract(entries = LINUX_DEB_PROOF_CONTRACT) {
  const ids = new Set();
  for (const entry of entries) {
    if (!entry.id || ids.has(entry.id)) throw new Error(`Duplicate or missing Linux proof id: ${entry.id}`);
    if (!TIERS.has(entry.tier)) throw new Error(`Unknown Linux proof tier: ${entry.tier}`);
    if (!entry.owner) throw new Error(`Linux proof owner is missing: ${entry.id}`);
    if (entry.tier !== 'package-install' && !/\.test\.(?:mjs|ts)$/u.test(entry.owner)) {
      throw new Error(`Early Linux proof must be owned by a deterministic test: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return entries;
}
