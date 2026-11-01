import { createRequire } from 'node:module';

// Use the declared Capacitor CLI dependency, independent of npm's root hoisting decisions.
const require = createRequire(import.meta.url);
const capacitorRequire = createRequire(require.resolve('@capacitor/cli/package.json'));
export default capacitorRequire('semver');
