import type { DailyFlowSettings } from '../../../../../lib/core/flow/dailyFlowContract';
import { flowDay } from '../../../../../lib/core/flow/dailyFlowPlanning';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import type { ReadIntent } from '../../../../../lib/core/flow/readIntentJournal';
import { companionWorkspaceSnapshots, subscribeCommittedCompanionWorkspace } from '../companionWorkspaceSnapshotStore';
import { subscribeCompanionReadingScope } from '../reading/companionReadingScope';

type Input = { session: DailyFlowSession; now: string; mode: ReadIntent['mode'] };
type Projection = { observedRevision: number; session: DailyFlowSession };
function catalog() {
  const snapshot = companionWorkspaceSnapshots.getSnapshot();
  return [snapshot?.nodesById, snapshot?.nodeOrder, snapshot?.trashedNodeIds];
}
function sameCatalog(before: ReturnType<typeof catalog>, after: ReturnType<typeof catalog>) {
  return before.every((value, index) => value === after[index]);
}

// One successor of the visible cursor. It is disposable display state, never a saved queue.
export class CompanionReadDisplayPreparation {
  private generation = 0;
  private prepared: { key: string; catalog: ReturnType<typeof catalog>; controller: AbortController; value: Promise<Projection> } | null = null;
  private readonly unsubscribe: (() => void)[];

  constructor(private readonly settings: () => DailyFlowSettings,
    private readonly project: (input: Input, settings: DailyFlowSettings, signal: AbortSignal) => Promise<Projection>,
    ownsReading: (id: string) => boolean) {
    this.unsubscribe = [subscribeCompanionReadingScope(() => this.invalidate()),
      subscribeCommittedCompanionWorkspace(async (scope, db) => {
        if (scope.kind === 'full' || scope.structure || scope.nodeIds.length || scope.reviewNodeIds?.length ||
          scope.readingNodeIds?.some(id => db || !ownsReading(id))) this.invalidate();
      })];
  }

  invalidate() { this.generation += 1; this.prepared?.controller.abort(); this.prepared = null; }
  close() { this.invalidate(); this.unsubscribe.forEach(unsubscribe => unsubscribe()); }

  private key(input: Input, settings: DailyFlowSettings) {
    return JSON.stringify([this.generation, input.mode, flowDay(input.now, settings), settings,
      input.session.daily, input.session.cycle, input.session.currentNodeId]);
  }

  prepare(input: Input, signal?: AbortSignal) {
    const settings = this.settings();
    const key = this.key(input, settings);
    const current = catalog();
    if (this.prepared?.key === key && !this.prepared.controller.signal.aborted && sameCatalog(this.prepared.catalog, current)) return this.prepared.value;
    const controller = new AbortController();
    let settled = false;
    const cancel = () => { if (!settled) controller.abort(signal?.reason); };
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    const value = this.project(input, settings, controller.signal).finally(() => {
      settled = true;
      signal?.removeEventListener('abort', cancel);
    });
    const prepared = { key, catalog: current, controller, value };
    this.prepared = prepared;
    void value.catch(() => { if (this.prepared === prepared) this.prepared = null; });
    return value;
  }

  async consume(input: Input): Promise<Projection> {
    const generation = this.generation;
    const before = catalog();
    const result = await this.prepare(input);
    // A real change during preparation/admission must not install an obsolete successor.
    if (generation !== this.generation || !sameCatalog(before, catalog())) return this.consume(input);
    this.prepared = null;
    return { ...result, session: { ...result.session, currentItemStartedAt: input.now,
      completedAt: result.session.currentNodeId ? null : input.now } };
  }
}
