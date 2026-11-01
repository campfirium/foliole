import semver from 'semver';

export function protobufCppMetadata(text) {
  const number = Number(/^#define GOOGLE_PROTOBUF_VERSION\s+(\d+)$/mu.exec(text)?.[1]);
  if (!Number.isSafeInteger(number) || number < 1_000_000) throw new Error('Vendored Protobuf C++ version is missing');
  return { version: `${Math.floor(number / 1_000_000)}.${Math.floor(number / 1000) % 1000}.${number % 1000}` };
}

const SWIFT_NAMES = {
  'ionic-team/capacitor': 'github.com/ionic-team/capacitor-swift-pm',
  'ionic-team/capacitor-swift-pm': 'github.com/ionic-team/capacitor-swift-pm',
  'apple/swift-protobuf': 'github.com/apple/swift-protobuf',
  'sqlcipher/SQLCipher.swift': 'github.com/sqlcipher/SQLCipher.swift',
  'weichsel/ZIPFoundation': 'github.com/weichsel/ZIPFoundation'
};

function relevantPackage(repository, pkg) {
  if (!pkg?.ecosystem || !pkg.name) return undefined;
  const ecosystem = pkg.ecosystem.toLowerCase();
  if (SWIFT_NAMES[repository]) return ecosystem === 'swift'
    ? pkg.name.toLowerCase() === SWIFT_NAMES[repository].toLowerCase() ? true : undefined
    : repository.startsWith('ionic-team/') && ecosystem === 'npm' && pkg.name === '@capacitor/ios';
  // Implementation repositories also publish advisories for bindings not present in the iOS build.
  if (['pip', 'pecl', 'maven', 'rubygems', 'npm', 'go', 'nuget'].includes(ecosystem)) return false;
  if (ecosystem === 'c++') {
    const names = repository === 'protocolbuffers/protobuf' ? ['protobuf', 'protobuf-cpp']
      : repository === 'abseil/abseil-cpp' ? ['abseil', 'abseil-cpp'] : ['sqlcipher'];
    return names.includes(pkg.name.toLowerCase()) ? true : undefined;
  }
  return undefined;
}

function assessRange(version, range) {
  if (typeof range !== 'string') return undefined;
  const parts = range.split(',').map(part => part.trim());
  if (parts.length > 1 && !(parts.length === 2 && /^>=?/u.test(parts[0]) && /^<=?/u.test(parts[1]))) return undefined;
  const normalized = parts.join(' ');
  if (!semver.validRange(normalized) || !semver.valid(version)) return undefined;
  return semver.satisfies(version, normalized);
}

export function advisoryReviews(repository, version, advisories, matchingVersion = version.replace(/^v/u, '')) {
  return advisories.flatMap(row => {
    const vulnerabilities = row.vulnerabilities;
    const candidates = vulnerabilities?.filter(item => relevantPackage(repository, item.package) !== false);
    if (Array.isArray(vulnerabilities) && vulnerabilities.length && !candidates.length) return [];
    const results = candidates?.map(item => relevantPackage(repository, item.package) === true
      ? assessRange(matchingVersion, item.vulnerable_version_range) : undefined);
    if (results?.length && results.every(result => result === false)) return [];
    const matched = results?.some(result => result === true);
    return [{ platform: 'ios', advisory: `review-${row.advisory}`, package: repository,
      versions: [matchingVersion], severity: matched ? row.severity === 'medium' ? 'moderate'
        : ['low', 'high', 'critical'].includes(row.severity) ? row.severity : 'unclassified' : 'info', source: row.source,
      assessment: matched ? 'Installed component matches official affected range; application exposure requires review'
        : 'Official advisory package/range is unresolved; not a confirmed vulnerability' }];
  });
}
