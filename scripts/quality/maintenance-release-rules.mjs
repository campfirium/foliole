// Release-time maintenance items and the path rules that decide whether each runs.
// Mirrors the "发布前质量维护" table of the foliole-quality-maintenance skill; when the
// table changes, change this catalog with it. Test files never count as a trigger.

import { TEST_FILE_PATTERN } from '../lib/path-domain-registry.mjs';

const NON_PRODUCTION = /(test-?support\.|\/__tests__\/|\/fixtures?\/)/iu;
const PRODUCT_ROOT = /^(src|lib|electron)\//u;

export const FORCE_AFTER_RELEASES = 3;
export const FORCE_AFTER_DAYS = 28;

export function isProductionPath(filePath) {
  return PRODUCT_ROOT.test(filePath) && !TEST_FILE_PATTERN.test(filePath) && !NON_PRODUCTION.test(filePath);
}

function matcher(pattern) {
  return (files) => files.filter((filePath) => isProductionPath(filePath) && pattern.test(filePath));
}

const UPGRADE_RECOVERY = /(schema|migrat|startup|boot|launch|recover|restore|backup)/iu;
const DATABASE_AUDIT =
  /(schema|migrat|(^|\/)database\/|sync|import|trash|delet|restor|purge|recover|persist|storage)/iu;
const PERFORMANCE = /(query|sql|sync|startup|boot|launch|list|tree|outline|editor|load|snapshot|search)/iu;
const MAIN_THREAD_LIB = /^lib\/core\/database\/.*(mutation|write|writer|transaction|queue)/iu;

/**
 * Each item: `when` returns the trigger paths (null = runs every release),
 * `modeTrigger` returns the paths that escalate the run from `modes.base` to `modes.escalated`.
 */
export const RELEASE_ITEMS = [
  { id: 'remediation-review', label: '整改复盘', when: null },
  { id: 'log-review', label: '日志巡检', when: null },
  { id: 'unstable-reference-scan', label: '引用不稳定扫描', when: null },
  {
    id: 'upgrade-recovery',
    label: '升级恢复',
    when: null,
    modes: { base: 'release', escalated: 'quarterly' },
    modeTrigger: matcher(UPGRADE_RECOVERY)
  },
  { id: 'system-integration', label: '系统集成 all', when: (files) => files.filter(isProductionPath) },
  { id: 'database-audit', label: '数据库审计', when: matcher(DATABASE_AUDIT) },
  { id: 'performance-quarterly', label: '性能 quarterly', when: matcher(PERFORMANCE) },
  {
    id: 'main-thread-blocking',
    label: '主线程阻塞审计',
    when: (files) =>
      files.filter(
        (filePath) => isProductionPath(filePath) && (filePath.startsWith('electron/') || MAIN_THREAD_LIB.test(filePath))
      ),
    manualTrigger: '日志巡检发现 app_responsive 卡顿时也执行'
  }
];

export const RELEASE_ITEM_IDS = RELEASE_ITEMS.map((item) => item.id);
