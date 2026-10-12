/* global process */
export default class SyncSqliteDiagnosticReporter {
  onTestCaseReady(test) {
    process.stderr.write(`${JSON.stringify({ event: 'diagnostic_test_start', at: new Date().toISOString(),
      file: test.module.moduleId, name: test.fullName })}\n`);
  }
  onTestCaseResult(test) {
    process.stderr.write(`${JSON.stringify({ event: 'diagnostic_test_end', at: new Date().toISOString(),
      file: test.module.moduleId, name: test.fullName, result: test.result(), diagnostic: test.diagnostic() })}\n`);
  }
}
