import type { DailyFlowSettings } from '../../../../../lib/core/flow/dailyFlowContract';
import { flowDay } from '../../../../../lib/core/flow/dailyFlowPlanning';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import type { ReadIntent } from '../../../../../lib/core/flow/readIntentJournal';
import { subscribeCommittedCompanionWorkspace } from '../companionWorkspaceSnapshotStore';
import { subscribeCompanionReadingScope } from '../reading/companionReadingScope';

type Input = { session: DailyFlowSession; now: string; mode: ReadIntent['mode'] };
type Projection = { observedRevision: number; session: DailyFlowSession };
// One successor of the visible cursor. It is disposable display state, never a saved queue.
export class CompanionReadDisplayPreparation {
  private generation = 0;
  private prepared: { key: string; controller: AbortController; lifetime: { settled: boolean; demanded: boolean }; value: Promise<Projection> } | null = null;
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
      input.session.daily?.scope, input.session.daily?.dayKey, input.session.currentNodeId,
      input.session.cycle?.scanAfter, input.session.cycle?.lapLimit]);
  }

  prepare(input: Input, signal?: AbortSignal) {
    const settings = this.settings();
    const key = this.key(input, settings);
    if (this.prepared?.key === key && !this.prepared.controller.signal.aborted) return this.prepared.value;
    const controller = new AbortController();
    const lifetime = { settled: false, demanded: false };
    const cancel = () => { if (!lifetime.settled && !lifetime.demanded) controller.abort(signal?.reason); };
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    const value = this.project(input, settings, controller.signal).finally(() => {
      lifetime.settled = true;
      signal?.removeEventListener('abort', cancel);
    });
    const prepared = { key, controller, lifetime, value };
    this.prepared = prepared;
    void value.catch(() => { if (this.prepared === prepared) this.prepared = null; });
    return value;
  }

  async consume(input: Input): Promise<Projection> {
    const generation = this.generation;
    const value = this.prepare(input);
    if (this.prepared?.value === value) this.prepared.lifetime.demanded = true;
    const result = await value;
    // A real change during preparation/admission must not install an obsolete successor.
    if (generation !== this.generation) return this.consume(input);
    this.prepared = null;
    const next = result.session;
    if (!input.session.cycle || !next.cycle) throw new Error('daily_flow_display_changed');
    // A local receipt may advance counters/token while retaining this exact display cursor.
    // Keep those acknowledgements and consume only the prepared navigation state.
    return { ...result, session: { ...input.session, currentNodeId: next.currentNodeId,
      queueNodeIds: next.queueNodeIds, soonNodeIds: next.soonNodeIds ?? [], hiddenSoonNodeIds: next.hiddenSoonNodeIds ?? [],
      cycle: { ...input.session.cycle,
        scanAfter: next.cycle.scanAfter, lapLimit: next.cycle.lapLimit, clearedAt: next.cycle.clearedAt },
      currentItemStartedAt: input.now, isAnswerRevealed: false, continueNodeId: null,
      completedAt: next.currentNodeId ? null : input.now } };
  }
}
