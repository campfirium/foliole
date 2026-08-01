import type { WebContents } from 'electron';

import type { NativeDesktopUpdateState } from '../../lib/platform/nativeUpdateContract.js';

import { configureDesktopUpdater, type DesktopUpdaterAdapter } from './desktopUpdateAdapter.js';
import {
  classifyDesktopUpdateFailure,
  desktopUpdateDiagnosticLabel,
  type DesktopUpdateFailureStage
} from './desktopUpdateErrorPolicy.js';
import { DesktopUpdateRetry } from './desktopUpdateRetry.js';
import { createDesktopUpdateRecord, type DesktopUpdateStateStore } from './desktopUpdateStateStore.js';

export type { DesktopUpdaterAdapter } from './desktopUpdateAdapter.js';

interface DesktopUpdateServiceOptions {
  eventChannel: string;
  getCurrentVersion: () => string;
  isApplicable: () => boolean;
  loadUpdater: () => Promise<DesktopUpdaterAdapter>;
  prepareInstall: () => Promise<boolean>;
  reportDiagnostic?: (label: string) => void;
  retryDelaysMs?: readonly number[];
  stateStore: DesktopUpdateStateStore;
}

const NOT_APPLICABLE_STATE: NativeDesktopUpdateState = { phase: 'not-applicable' };
const IDLE_STATE: NativeDesktopUpdateState = { phase: 'idle' };
export class DesktopUpdateService {
  private state: NativeDesktopUpdateState;
  private initializationPromise: Promise<void> | null = null;
  private readonly subscribers = new Set<WebContents>();
  private targetVersion: string | null = null;
  private updater: DesktopUpdaterAdapter | null = null;
  private updaterPromise: Promise<DesktopUpdaterAdapter> | null = null;
  private operationId = 0;
  private readonly retry: DesktopUpdateRetry;
  private downloadPromise: Promise<NativeDesktopUpdateState> | null = null;

  constructor(private readonly options: DesktopUpdateServiceOptions) {
    this.state = options.isApplicable() ? IDLE_STATE : NOT_APPLICABLE_STATE;
    this.retry = new DesktopUpdateRetry(options.retryDelaysMs);
  }

  getState() {
    return this.state;
  }

  async start() {
    if (!this.options.isApplicable()) return this.setState(NOT_APPLICABLE_STATE);
    await this.ensureInitialized();
    return this.state;
  }

  async check(targetVersion: string, sender: WebContents) {
    this.subscribers.add(sender);
    if (!this.options.isApplicable()) return this.setState(NOT_APPLICABLE_STATE);
    await this.ensureInitialized();
    const normalizedVersion = targetVersion.trim();
    if (!normalizedVersion) return this.state;
    if (normalizedVersion === this.options.getCurrentVersion()) return this.clearTarget();
    if (this.state.phase === 'checking' || this.state.phase === 'downloading' || this.state.phase === 'ready') {
      return this.state;
    }
    await this.beginTarget(normalizedVersion);
    return this.state;
  }

  async download() {
    if (this.state.phase === 'downloading' || this.state.phase === 'ready') return this.state;
    if (this.state.phase !== 'available' || !this.targetVersion) return this.setInvalidState();
    return this.startDownload(this.operationId, this.targetVersion);
  }

  async install() {
    if (this.state.phase !== 'ready') return this.setInvalidState();
    const readyState = this.state;
    if (!(await this.options.prepareInstall())) {
      this.options.reportDiagnostic?.('desktop_update_install_preparation_failed');
      return this.setState(readyState);
    }
    try {
      const updater = await this.ensureUpdater();
      updater.quitAndInstall(false, true);
    } catch {
      this.options.reportDiagnostic?.('desktop_update_install_launch_failed');
      return this.setState(readyState);
    }
    return this.state;
  }

  private async beginTarget(version: string) {
    this.retry.reset();
    this.operationId += 1;
    this.targetVersion = version;
    try {
      await this.options.stateStore.write(createDesktopUpdateRecord(
        'discovered', this.options.getCurrentVersion(), version
      ));
    } catch {
      this.options.reportDiagnostic?.('desktop_update_state_write_failed');
      this.setState({ phase: 'available', version });
      return;
    }
    await this.startCheck(this.operationId, version);
  }

  private async startCheck(operationId: number, version: string) {
    if (!this.isCurrent(operationId, version)) return this.state;
    this.setState({ phase: 'checking', version });
    try {
      const result = await (await this.ensureUpdater()).checkForUpdates();
      if (!this.isCurrent(operationId, version)) return this.state;
      if (!result?.isUpdateAvailable || result.updateInfo.version !== version) {
        this.setState({ phase: 'pending-asset', version });
        this.scheduleRecovery('check', operationId, version);
        return this.state;
      }
      this.setState({ phase: 'available', version });
      void this.startDownload(operationId, version);
    } catch (error) {
      this.handleFailure('check', error, operationId, version);
    }
    return this.state;
  }

  private startDownload(operationId: number, version: string) {
    if (this.downloadPromise) return this.downloadPromise;
    this.setState({ phase: 'downloading', percent: 0, version });
    this.downloadPromise = this.runDownload(operationId, version).finally(() => {
      this.downloadPromise = null;
    });
    return this.downloadPromise;
  }

  private async runDownload(operationId: number, version: string) {
    try {
      await (await this.ensureUpdater()).downloadUpdate();
      if (!this.isCurrent(operationId, version)) return this.state;
      await this.options.stateStore.write(createDesktopUpdateRecord(
        'downloaded', this.options.getCurrentVersion(), version
      ));
      this.retry.reset();
      return this.setState({ phase: 'ready', percent: 100, version });
    } catch (error) {
      this.handleFailure('download', error, operationId, version);
      return this.state;
    }
  }

  private handleFailure(stage: DesktopUpdateFailureStage, error: unknown, operationId: number, version: string) {
    if (!this.isCurrent(operationId, version)) return;
    const kind = classifyDesktopUpdateFailure(error);
    if (kind === 'structural') {
      this.options.reportDiagnostic?.(desktopUpdateDiagnosticLabel(stage, kind));
      this.retry.reset();
      this.setState({ phase: 'available', version });
      return;
    }
    this.scheduleRecovery(stage, operationId, version);
  }

  private scheduleRecovery(stage: DesktopUpdateFailureStage, operationId: number, version: string) {
    if (!this.isCurrent(operationId, version)) return;
    if (!this.retry.schedule(() => {
      if (stage === 'download') void this.startDownload(operationId, version);
      else void this.startCheck(operationId, version);
    })) {
      this.options.reportDiagnostic?.(desktopUpdateDiagnosticLabel(stage, 'retry-exhausted'));
      this.setState({ phase: 'available', version });
    }
  }

  private async ensureUpdater() {
    if (this.updater) return this.updater;
    this.updaterPromise ??= this.options.loadUpdater().then((updater) => {
      configureDesktopUpdater(updater, () => this.targetVersion ?? undefined, (state) => {
        if (this.state.phase === 'downloading') this.setState(state);
      });
      this.updater = updater;
      return updater;
    });
    return this.updaterPromise;
  }

  private async ensureInitialized() {
    this.initializationPromise ??= this.initialize();
    await this.initializationPromise;
  }

  private async initialize() {
    try {
      const record = await this.options.stateStore.read();
      if (!record) return;
      if (record.installedVersion !== this.options.getCurrentVersion()) return this.clearRecordSafely();
      this.targetVersion = record.targetVersion;
      this.operationId += 1;
      void this.startCheck(this.operationId, record.targetVersion);
    } catch {
      this.options.reportDiagnostic?.('desktop_update_state_read_failed');
    }
  }

  private isCurrent(operationId: number, version: string) {
    return this.operationId === operationId && this.targetVersion === version;
  }

  private async clearTarget() {
    this.retry.reset();
    this.operationId += 1;
    this.targetVersion = null;
    await this.clearRecordSafely();
    return this.setState(IDLE_STATE);
  }

  private async clearRecordSafely() {
    try {
      await this.options.stateStore.clear();
    } catch {
      this.options.reportDiagnostic?.('desktop_update_state_clear_failed');
    }
  }

  private setInvalidState() {
    return this.setState({ errorCode: 'invalid-command-state', phase: 'error', version: this.targetVersion ?? undefined });
  }

  private setState(state: NativeDesktopUpdateState) {
    this.state = state;
    for (const subscriber of this.subscribers) {
      if (subscriber.isDestroyed()) this.subscribers.delete(subscriber);
      else subscriber.send(this.options.eventChannel, state);
    }
    return state;
  }
}
