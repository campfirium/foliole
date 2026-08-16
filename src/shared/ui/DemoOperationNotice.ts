import type { Translate } from '../localization/LocalizationProvider';

import { showAppRuntimeNotice } from './AppRuntimeNotice';

export function showDemoOperationNotice(t: Translate) {
  showAppRuntimeNotice(t('desktop.demo.operationNotDemonstrable'), 'info');
}
