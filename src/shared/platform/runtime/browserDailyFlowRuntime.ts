import { commitCycleFlow } from '../../../../lib/core/flow/cycleFlowCommit';
import { openStoredDailyFlow } from '../../../../lib/core/flow/cycleFlowOpen';
import type { DailyFlowSettings } from '../../../../lib/core/flow/dailyFlowContract';
import { retainDailyFlowRetry, settleDailyFlowRetry } from '../../../../lib/core/flow/dailyFlowRetry';
import { readStoredDailyFlowView } from '../../../../lib/core/flow/dailyFlowView';
import type { BrowserWorkspaceCandidate } from '../../../store/workspaceBrowserCandidate';


import { createBrowserDailyFlowStore } from './browserDailyFlowStore';
import { saveBrowserFlowSourceSettings } from './browserFlowSourceSettings';
import type { BrowserDailyFlowRuntime } from './dailyFlowBrowserRuntime';

export function createBrowserDailyFlowRuntime(args: {
  transaction<T>(knownNodes: Record<string, unknown>, action: (candidate: BrowserWorkspaceCandidate) => Promise<T>): Promise<T>;
  settings(): DailyFlowSettings;
}): BrowserDailyFlowRuntime {
  return {
    open: (input, nodes) => args.transaction(nodes, candidate =>
      openStoredDailyFlow(createBrowserDailyFlowStore(candidate.storageGet, candidate.storageSet), input, args.settings())),
    commit: (input, nodes) => args.transaction(nodes, candidate => {
      const retained = retainDailyFlowRetry(input);
      candidate.afterPublish(() => settleDailyFlowRetry(retained.opId));
      return commitCycleFlow(createBrowserDailyFlowStore(candidate.storageGet, candidate.storageSet), retained, args.settings());
    }),
    view: (input, seed, nodes) => args.transaction(nodes, async candidate => {
      const store = createBrowserDailyFlowStore(candidate.storageGet, candidate.storageSet);
      const settings = args.settings();
      let view = await readStoredDailyFlowView(store, input, settings);
      if (view.status === 'needs-preparation') {
        const prepared = await openStoredDailyFlow(store, { now: input.now, mode: input.mode,
          seed, prepareOnly: true, startup: !seed.sessionStartedAt }, settings);
        view = await readStoredDailyFlowView(store, { ...input, mode: prepared.mode ?? input.mode }, settings);
      }
      if (view.status !== 'ready') throw new Error('daily_flow_view_unavailable');
      return { view };
    }),
    saveSourceSettings: (input, nodes) => args.transaction(nodes, candidate =>
      saveBrowserFlowSourceSettings(candidate, input, args.settings().scope ?? ''))
  };
}
