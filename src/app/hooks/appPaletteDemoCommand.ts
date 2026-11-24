import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { getDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { showDemoOperationNotice } from '../../shared/ui/DemoOperationNotice';
import { requestDemoFolderImport } from '../components/importActivityRequests';

const NON_DEMONSTRABLE_DEMO_COMMAND_IDS: ReadonlySet<string> = new Set([
  APP_COMMAND_IDS.checkForUpdates,
  APP_COMMAND_IDS.exportCurrentArticle,
  APP_COMMAND_IDS.openLocalFile,
  APP_COMMAND_IDS.publishToDiscourse,
  APP_COMMAND_IDS.publishToFoliole,
  APP_COMMAND_IDS.publishToWordPress,
  APP_COMMAND_IDS.restartApp
]);

export function runDemoCommandPreview(id: string, t: Translate) {
  if (!getDemoRuntimeState().isDemo) return false;
  if (id === APP_COMMAND_IDS.importFolder) {
    requestDemoFolderImport();
    return true;
  }
  if (!NON_DEMONSTRABLE_DEMO_COMMAND_IDS.has(id)) return false;
  showDemoOperationNotice(t);
  return true;
}
