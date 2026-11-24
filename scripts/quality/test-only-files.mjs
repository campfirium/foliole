// The repository's single rule for "this path is test code only": test files, test support
// modules and the shared src/test tree. QA local repair and release test repair both use it.
const TEST_FILE = /\.test\.[cm]?[jt]sx?$|[.-]test-?support\.[cm]?[jt]sx?$|TestSupport\.[cm]?[jt]sx?$/u;

export function isTestOnlyFile(file) {
  return TEST_FILE.test(file) || file.startsWith('src/test/');
}
