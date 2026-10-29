import type { DailyFlowResult } from '../../../../../lib/core/flow/dailyFlowContract';
import { advanceDailyFlowDisplay } from '../../../../../lib/core/flow/dailyFlowDisplayAdvance';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import type { ReadIntent, ReadIntentJournal, ReadIntentRow } from '../../../../../lib/core/flow/readIntentJournal';
import { createCompanionUuid } from '../../companionUuid';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { companionDailyFlowPersistence, companionDailyFlowSettings } from './companionDailyFlow';
import { applyCompanionFlowReceipt } from './companionDailyFlowDisplay';
import { applyReadIntent } from './companionReadIntentApply';
import { correctReadIntent } from './companionReadIntentCommand';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

const owners = new WeakMap<CapacitorCompanionDatabaseOwner, Promise<CompanionReadIntents>>();
export function getCompanionReadIntents() {
  const owner = getIosCompanionDatabaseOwner();
  let value = owners.get(owner);
  if (!value) {
    value = owner.readIntentJournal().then(async journal => {
      const engine = new CompanionReadIntents(owner, journal);
      await engine.restore();
      return engine;
    });
    owners.set(owner, value);
  }
  return value;
}

export async function closeCompanionReadIntents(owner: CapacitorCompanionDatabaseOwner) {
  const engine = await owners.get(owner);
  if (engine) await engine.close();
}

export class CompanionReadIntents {
  private closed = false;
  private admitting: Promise<unknown> = Promise.resolve();
  private running: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private rows: ReadIntentRow[] = [];
  private failure: string | null = null;
  private correction = false;
  private receipt: DailyFlowResult | null = null;
  private applied: { nodeId: string; revision: number }[] = [];
  private predecessor: string | null = null;
  private revision = 0;
  constructor(private readonly owner: CapacitorCompanionDatabaseOwner, readonly journal: ReadIntentJournal) {}

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get version() { return this.revision; }
  get pending() { return this.rows.length > 0; }
  get error() { return this.failure; }
  get corrected() { return this.correction; }
  get result() { return this.receipt; }
  private publish() { this.revision += 1; this.listeners.forEach(listener => { try { listener(); } catch { /* Observers do not own persistence. */ } }); }

  async restore() {
    this.rows = await this.journal.rows();
    this.predecessor = this.rows.at(-1)?.intent.id ?? null;
    this.failure = this.rows[0]?.error ?? null;
    if (!this.failure) this.start();
  }

  accept(args: { session: DailyFlowSession; now: string; mode: ReadIntent['mode']; historyKey: string }) {
    const accepted = this.admitting.then(() => this.acceptOne(args));
    this.admitting = accepted.catch(() => undefined);
    return accepted;
  }

  private async acceptOne(args: { session: DailyFlowSession; now: string; mode: ReadIntent['mode']; historyKey: string }) {
    if (this.closed) throw new Error('read_intent_owner_closed');
    if (this.failure) throw new Error(this.failure);
    const { session, now, mode, historyKey } = args;
    this.correction = false;
    if (!session.daily || !session.currentNodeId) throw new Error('daily_flow_not_open');
    const intent: ReadIntent = { id: createCompanionUuid(), libraryId: this.journal.libraryId,
      nodeId: session.currentNodeId, dayKey: session.daily.dayKey, now, mode, historyKey,
      predecessor: this.predecessor, settings: structuredClone({ ...companionDailyFlowSettings(), ...(session.dayWindow ? { dayWindow: session.dayWindow } : {}) }) };
    // Calculate only a display projection; admission is the sole durable foreground write.
    const excluded = [...this.rows.map(row => row.intent.nodeId), intent.nodeId];
    const projected = this.owner.readInteractiveSnapshot(db => advanceDailyFlowDisplay(db,
      { session, now, mode, excluded, applied: this.applied, knownSnapshot: companionWorkspaceSnapshots.getSnapshot() }, intent.settings, companionDailyFlowPersistence));
    const projection = await projected;
    this.applied = this.applied.filter(value => value.revision > projection.observedRevision);
    await this.journal.accept(intent);
    this.predecessor = intent.id;
    this.rows.push({ ordinal: 0, intent, command: null, entry: null, state: 'pending', error: null });
    this.publish();
    this.start();
    return { id: intent.id, session: projection.session };
  }

  async close() {
    this.closed = true;
    await this.admitting;
    await this.drain().catch(() => undefined);
  }

  retry() {
    this.failure = null;
    this.publish();
    this.start();
    return this.drain();
  }

  async drain() {
    while (this.running) await this.running;
    if (this.failure) throw new Error(this.failure);
  }

  private start() {
    if (this.running || this.failure || !this.pending) return;
    this.running = this.process().finally(() => {
      this.running = null;
      if (!this.failure && this.pending) this.start();
    });
  }

  private async process() {
    while (this.rows.length) {
      const row = this.rows[0]!;
      let acknowledged = false;
      try {
        const outcome = await runCompanionHighValueMutationTask(() => this.owner.runWriter(db =>
          applyReadIntent(db, this.journal, row.intent.id)),
        { kind: 'nodes', nodeIds: [], readingNodeIds: [row.intent.nodeId] });
        await this.journal.settle(row.intent.id, outcome.state,
          outcome.state === 'superseded' ? 'The clicked topic changed before it could be saved.' : null);
        acknowledged = true;
        this.rows.shift();
        this.correction ||= outcome.state === 'superseded';
        if (outcome.result) {
          this.receipt = outcome.result;
          if (outcome.state === 'applied' && outcome.result.session.daily?.dayKey === row.intent.dayKey) this.applied.push({
            nodeId: row.intent.nodeId, revision: outcome.result.session.daily.revision });
          // The caller's display cursor is deliberately absent from this receipt path.
          await applyCompanionFlowReceipt(outcome.result, companionWorkspaceSnapshots.getSnapshot());
        }
        if (outcome.state === 'superseded') this.failure = 'The clicked topic changed before it could be saved.';
        this.publish();
      } catch (error) {
        this.failure = error instanceof Error ? error.message : String(error);
        if (!acknowledged && /^daily_flow_(changed|learning_changed)$/.test(this.failure)) {
          await this.journal.settle(row.intent.id, 'superseded', this.failure);
          this.rows.shift();
          this.receipt = await this.owner.runWriter(db => db.transaction(tx => correctReadIntent(tx, row.intent)));
          this.correction = true;
          this.publish();
          continue;
        }
        if (!acknowledged) await this.journal.settle(row.intent.id, 'pending', this.failure).catch(() => undefined);
        this.publish();
        return;
      }
    }
  }
}
