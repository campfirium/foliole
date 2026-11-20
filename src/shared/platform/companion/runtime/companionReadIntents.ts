import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { DailyFlowResult } from '../../../../../lib/core/flow/dailyFlowContract';
import { advanceDailyFlowDisplay } from '../../../../../lib/core/flow/dailyFlowDisplayAdvance';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import { timeFlow, type FlowTiming } from '../../../../../lib/core/flow/flowTiming';
import type { ReadIntent, ReadIntentJournal, ReadIntentRow } from '../../../../../lib/core/flow/readIntentJournal';
import { createCompanionUuid } from '../../companionUuid';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { timeCompanionActivity } from './companionActivityTiming';
import { companionDailyFlowPersistence, companionDailyFlowSettings } from './companionDailyFlow';
import { applyCompanionFlowReceipt } from './companionDailyFlowDisplay';
import { prepareAdmittedRead } from './companionReadAdmissionCommand';
import { CompanionReadDisplayPreparation } from './companionReadDisplayPreparation';
import { applyReadIntent } from './companionReadIntentApply';
import { correctReadIntent } from './companionReadIntentCommand';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

type ReadAdmission = { session: DailyFlowSession; now: string; mode: ReadIntent['mode']; historyKey: string;
  snapshot?: WorkspaceSnapshot; releaseSequentialReading?: boolean; nextTopicId?: string };

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
  private displayRecovery: (() => Promise<DailyFlowResult>) | null = null;
  private receipt: DailyFlowResult | null = null;
  private applied: { nodeId: string; revision: number }[] = [];
  private predecessor: string | null = null;
  private applyingNodeId: string | null = null;
  private revision = 0;
  private readonly jobs = new Map<string, ReturnType<CompanionReadDisplayPreparation['claim']>>();
  private readonly timings = new Map<string, FlowTiming>();
  readonly displayPreparation: CompanionReadDisplayPreparation;
  constructor(private readonly owner: CapacitorCompanionDatabaseOwner, readonly journal: ReadIntentJournal) {
    this.displayPreparation = new CompanionReadDisplayPreparation(companionDailyFlowSettings,
      (args, settings, signal, timing) => owner.readInteractiveSnapshot(db => advanceDailyFlowDisplay(db,
        { ...args, excluded: [...this.rows.map(row => row.intent.nodeId), args.session.currentNodeId!],
          applied: this.applied, knownSnapshot: companionWorkspaceSnapshots.getSnapshot() },
        { ...settings, ...(args.session.dayWindow ? { dayWindow: args.session.dayWindow } : {}) }, companionDailyFlowPersistence, timing), signal),
      id => this.applyingNodeId === id);
  }

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

  accept(args: ReadAdmission, timing?: FlowTiming) {
    const accepted = timeFlow(timing, 'read-admission', () => this.admitting.then(() => this.acceptOne(args, timing)));
    this.admitting = accepted.catch(() => undefined);
    return accepted;
  }

  private async acceptOne(args: ReadAdmission, timing?: FlowTiming) {
    if (this.closed) throw new Error('read_intent_owner_closed');
    if (this.failure) throw new Error(this.failure);
    const { session, now, mode, historyKey } = args;
    this.correction = false;
    if (!session.daily || !session.currentNodeId) throw new Error('daily_flow_not_open');
    const intent: ReadIntent = { id: createCompanionUuid(), libraryId: this.journal.libraryId,
      nodeId: session.currentNodeId, dayKey: session.daily.dayKey, now, mode, historyKey,
      predecessor: this.predecessor, admittedCommand: true, settings: structuredClone({ ...companionDailyFlowSettings(), ...(session.dayWindow ? { dayWindow: session.dayWindow } : {}) }) };
    const project = async () => {
      const projection = await timeFlow(timing, 'read-next-wait',
        () => this.jobs.get(intent.id)?.value ?? this.displayPreparation.consume({ session, now, mode }, timing));
      this.applied = this.applied.filter(value => value.revision > projection.observedRevision);
      return projection.session;
    };
    if ((args.releaseSequentialReading || args.nextTopicId) && this.pending) {
      await timeFlow(timing, 'read-drain', () => this.drain());
    }
    const releaseSnapshot = args.releaseSequentialReading || args.nextTopicId ? companionWorkspaceSnapshots.getSnapshot() ?? args.snapshot : undefined;
    const prepared = await prepareAdmittedRead(this.owner, intent, session,
      releaseSnapshot ?? args.snapshot ?? this.displayPreparation.snapshot({ session, now, mode }), releaseSnapshot, args.nextTopicId);
    // A precomputed successor cannot account for queue membership changed by a release.
    const releasesTopics = (prepared.command.readings?.length ?? 0) > 1;
    await timeFlow(timing, 'read-journal', () => this.journal.accept(intent, prepared));
    if (timing) this.timings.set(intent.id, timing);
    if (!releasesTopics) this.jobs.set(intent.id, this.displayPreparation.claim({ session, now, mode }, timing));
    this.predecessor = intent.id;
    this.rows.push({ ordinal: 0, intent, ...prepared, state: 'pending', error: null });
    this.publish();
    this.start();
    if (releasesTopics) {
      await this.drain();
      return { id: intent.id, session: this.receipt!.session };
    }
    try { return { id: intent.id, session: await project() }; }
    catch (error) {
      this.jobs.delete(intent.id);
      this.displayRecovery = async () => ({ session: await project(), mode });
      this.failure = 'The Read was accepted, but the next topic could not be loaded. Retry to continue.';
      this.publish();
      throw new Error(this.failure, { cause: error });
    }
  }

  async close() {
    this.closed = true;
    this.displayPreparation.close();
    await this.admitting;
    await this.drain().catch(() => undefined);
  }

  async retry() {
    if (this.displayRecovery) {
      this.receipt = await this.displayRecovery();
      this.displayRecovery = null;
      this.correction = true;
    }
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
    this.running = timeCompanionActivity('read-intent', () => this.process()).finally(() => {
      this.running = null;
      if (!this.failure && this.pending) this.start();
    });
  }

  private async process() {
    while (this.rows.length) {
      const row = this.rows[0]!;
      let acknowledged = false;
      const timing = this.timings.get(row.intent.id);
      timing?.('read-background', 'start');
      try {
        const job = this.jobs.get(row.intent.id);
        const navigation = await job?.value.catch(() => null);
        const preparedNavigation = job && navigation && row.command?.sourceSession ? {
          source: row.command.sourceSession, next: navigation.session, valid: job.valid,
          ...(navigation.snapshot ? { snapshot: navigation.snapshot } : {}) } : undefined;
        const outcome = await runCompanionHighValueMutationTask(() => {
          this.applyingNodeId = row.intent.nodeId;
          return this.owner.runWriterSequence((db, commit) => applyReadIntent(db, this.journal,
            row.intent.admittedCommand ? row : row.intent.id, preparedNavigation, commit, timing), timing);
        }, { kind: 'nodes', nodeIds: [], readingNodeIds: row.command?.readings?.map(value => value.nodeId) ?? [row.intent.nodeId] }, timing)
          .finally(() => { this.applyingNodeId = null; });
        await timeFlow(timing, 'read-settle', () => this.journal.settle(row.intent.id, outcome.state,
          outcome.state === 'superseded' ? 'The clicked topic changed before it could be saved.' : null));
        this.timings.delete(row.intent.id);
        acknowledged = true;
        this.rows.shift();
        this.jobs.delete(row.intent.id);
        this.correction ||= outcome.state === 'superseded' || (row.command?.readings?.length ?? 0) > 1;
        if (outcome.result) {
          this.receipt = outcome.result;
          if (outcome.state === 'applied' && outcome.result.session.daily?.dayKey === row.intent.dayKey) this.applied.push({
            nodeId: row.intent.nodeId, revision: outcome.result.session.daily.revision });
          // The caller's display cursor is deliberately absent from this receipt path.
          const receipt = outcome.result;
          await timeFlow(timing, 'receipt', () => applyCompanionFlowReceipt(receipt, companionWorkspaceSnapshots.getSnapshot(), true));
        }
        if (outcome.state === 'superseded') this.failure = 'The clicked topic changed before it could be saved.';
        timing?.('read-background', outcome.state === 'applied' ? 'done' : 'superseded');
        this.publish();
      } catch (error) {
        timing?.('read-background', 'failed');
        this.failure = error instanceof Error ? error.message : String(error);
        if (!acknowledged && /^daily_flow_(changed|learning_changed)$/.test(this.failure)) {
          await this.journal.settle(row.intent.id, 'superseded', this.failure);
          this.rows.shift();
          this.timings.delete(row.intent.id);
          this.jobs.delete(row.intent.id);
          this.receipt = await this.owner.runWriter(db => db.transaction(tx => correctReadIntent(tx, row.intent)));
          this.correction = true;
          this.failure = 'The clicked topic changed before it could be saved.';
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
