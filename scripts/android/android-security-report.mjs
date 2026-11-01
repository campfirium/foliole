import { queryAndroidMavenAdvisories } from './android-osv-query.mjs';

function inventoryModules(inventory) {
  if (inventory?.schemaVersion !== 1 || !Array.isArray(inventory.configurations)
    || !inventory.configurations.length || !inventory.gradleVersion || !inventory.java?.version) {
    throw new Error('Missing or malformed resolved Gradle inventory');
  }
  const modules = new Map();
  for (const scope of inventory.configurations) {
    if (!Array.isArray(scope.modules) || !Array.isArray(scope.unresolved)
      || !Array.isArray(scope.localFiles) || !scope.name || !scope.project) {
      throw new Error('Malformed resolved configuration');
    }
    for (const module of scope.modules) {
      const key = `${module.group}:${module.name}:${module.version}`;
      const row = modules.get(key) ?? { ...module, scopes: [] };
      row.scopes.push(`${scope.project}:${scope.kind}:${scope.name}`);
      modules.set(key, row);
    }
  }
  return [...modules.values()];
}

function inventoryGaps(inventory) {
  const gaps = [
    { asset: 'Gradle distribution', reason: 'requires-official-advisory-review',
      version: inventory.gradleVersion, source: 'https://github.com/gradle/gradle/security/advisories' },
    { asset: 'JDK', reason: 'requires-distributor-and-trust-store-review', ...inventory.java },
    { asset: 'Embedded SQLite and cryptographic libraries', reason: 'component-versions-not-established-by-maven-coordinates' },
    { asset: 'Android SDK and Build Tools', reason: 'requires-official-toolchain-review', versions: inventory.android ?? [] },
    { asset: 'Other resolvable configurations', reason: 'outside-selected-scope',
      configurations: inventory.uninspectedConfigurations ?? [] }
  ];
  for (const scope of inventory.configurations) {
    if (scope.localFiles.length) gaps.push({ asset: `${scope.project}:${scope.name}`,
      reason: 'local-files-have-no-maven-identity', files: scope.localFiles });
  }
  return gaps;
}

export async function createAndroidSecurityReport(inventory, options = {}) {
  const modules = inventoryModules(inventory);
  const advisories = await queryAndroidMavenAdvisories(modules, options);
  const required = ['debugRuntimeClasspath', 'releaseRuntimeClasspath'];
  const errors = inventory.configurations.filter(scope => scope.status !== 'resolved'
    || scope.unresolved.length).map(scope => ({ project: scope.project,
    name: scope.name, reason: 'dependency-resolution-failed', unresolved: scope.unresolved }));
  for (const name of required) {
    if (!inventory.configurations.some(scope => scope.project === ':app' && scope.name === name)) {
      errors.push({ name, reason: 'required-runtime-scope-missing' });
    }
  }
  if (!inventory.configurations.some(scope => scope.project === ':' && scope.kind === 'buildscript')) {
    errors.push({ reason: 'root-buildscript-scope-missing' });
  }
  if (!modules.length) errors.push({ reason: 'resolved-inventory-has-no-maven-packages' });
  const results = advisories.results;
  const findings = results.filter(row => row.advisories.length);
  const sourceErrors = results.filter(row => row.status === 'error');
  errors.push(...sourceErrors.map(row => ({ reason: 'advisory-source-failed',
    module: row.module, message: row.error })));
  const unsupported = results.filter(row => row.status === 'unsupported');
  const gaps = inventoryGaps(inventory);
  gaps.push(...unsupported.map(row => ({
    asset: row.module, reason: row.error })));
  return { schemaVersion: 1, platform: 'android', scope: 'resolved-maven-dependencies',
    generatedAt: new Date().toISOString(), source: options.source ?? { mode: 'unspecified' },
    status: errors.length ? 'error' : findings.length ? 'findings' : unsupported.length ? 'unsupported' : 'clean',
    overallStatus: 'incomplete', coverage: 'partial', errors, gaps, findings,
    inventory, advisories };
}
