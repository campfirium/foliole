import { useEffect, useState } from 'react';

import {
  compareVersionStrings,
  readUpdateCheckState,
  subscribeUpdateCheckState,
  type UpdateCheckState
} from '../../shared/platform/updateCheck';

function shouldShowFeedbackUpdateNotice(state: UpdateCheckState, appVersion: string) {
  return Boolean(
    state.lastCheckStatus === 'available'
      && state.latestVersion
      && compareVersionStrings(state.latestVersion, appVersion) > 0
  );
}

export function useFeedbackUpdateNotice(appVersion: string) {
  const [state, setState] = useState(readUpdateCheckState);

  useEffect(
    () =>
      subscribeUpdateCheckState(() => {
        setState(readUpdateCheckState());
      }),
    []
  );

  return shouldShowFeedbackUpdateNotice(state, appVersion);
}
