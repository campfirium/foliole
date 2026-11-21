// What the quality-maintenance default inventory checks. Mirrors the "找到当前入口" and
// "机制守卫" tables of the foliole-quality-maintenance skill; change both together.

import {
  readBenchmarkReport,
  readDatabaseAuditReport,
  readDrillReport,
  readSystemIntegrationReport
} from './maintenance-inventory-reports.mjs';

export const MAINTENANCE_ENTRIES = [
  {
    id: 'system-integration',
    label: '系统集成',
    command: { npmScript: 'integration:maintain' },
    docs: ['scripts/README.system-integration.md'],
    readLatestReport: readSystemIntegrationReport
  },
  {
    id: 'database-audit',
    label: '数据库审计',
    command: { npmScript: 'database:audit' },
    docs: ['docs/maintenance/database-audit.md', 'docs/maintenance/database-audit-tables.md'],
    readLatestReport: readDatabaseAuditReport
  },
  {
    id: 'benchmark',
    label: '固定性能',
    command: { npmScript: 'benchmark:desktop' },
    docs: ['scripts/desktop/README.fixed-performance-benchmarks.md'],
    readLatestReport: readBenchmarkReport
  },
  {
    id: 'upgrade-recovery',
    label: '升级恢复',
    command: { file: 'scripts/sqlite/upgrade-recovery-drills.mjs' },
    docs: ['scripts/sqlite/README.upgrade-recovery-drills.md'],
    readLatestReport: readDrillReport
  }
];

/** Files that wire a script guard into quality checks when they mention it. */
export const GATE_WIRING_SOURCES = {
  files: ['package.json', 'scripts/quality/run-quality-fast.mjs', 'scripts/quality/quality-command-contract-data.mjs'],
  directories: [
    { path: 'scripts/quality', pattern: /^quality-gate.*\.sh$/u },
    { path: '.github/workflows', pattern: /\.ya?ml$/u }
  ]
};

/**
 * wiring: `gate` = a script that must be referenced by a quality entry point;
 * `test` = test files collected by the quality runs; `runtime` = product code (no gate).
 */
export const MECHANISM_GUARDS = [
  {
    label: '引用不稳定扫描',
    files: ['scripts/quality/unstable-reference-heavy-work.mjs'],
    wiring: 'gate'
  },
  {
    label: '手机端单点操作次数测试',
    filePattern: /\.workAmplification\.integration\.test\.ts$/u,
    wiring: 'test'
  },
  {
    label: '桌面 runtimeScaleGuard 与 sqlQueryBudget',
    files: [
      'electron/database/runtimeScaleGuard.integration.test.ts',
      'electron/database/sqlQueryBudget.testSupport.ts',
      'electron/database/scaleGuardKnownFindings.testSupport.ts'
    ],
    wiring: 'test',
    count: { file: 'electron/database/scaleGuardKnownFindings.testSupport.ts', pattern: /^\s*reason: /gmu, label: '已登记债务' }
  },
  {
    label: '必填写入类别（runWriter kind）',
    marker: { text: 'CompanionWriteKind', pathspec: 'src/' },
    wiring: 'runtime'
  },
  {
    label: '备份每轮落到终态的不变量测试',
    files: ['src/shared/platform/companion/folderBackup/companionFolderBackupResult.integration.test.ts'],
    wiring: 'test'
  },
  {
    label: '手机端慢操作诊断记录',
    files: ['src/shared/platform/companion/runtime/companionSlowOperations.ts'],
    wiring: 'runtime'
  }
];
