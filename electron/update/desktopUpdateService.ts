import type { WebContents } from 'electron';

import type { NativeDesktopUpdateState } from '../../lib/platform/nativeUpdateContract.js';

export interface DesktopUpdaterAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  checkForUpdates: () => Promise<{ updateInfo: { version: string } } | null>;
  downloadUpdate: () => Promise<string[]>;
  on: (event: string, listener: (payload?: Record<string, unknown>) => void) => unknown;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
}

interface DesktopUpdateServiceOptions {
  eventChannel: string;
  isApplicable: () => boolean;
  loadUpdater: () => Promise<DesktopUpdaterAdapter>;
  prepareInstall: () => Promise<boolean>;
}

const NOT_APPLICABLE_STATE: NativeDesktopUpdateState = { phase: 'not-applicable' };
const IDLE_STATE: NativeDesktopUpdateState = { phase: 'idle' };

function safeNumber(value: unknown, minimum = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : undefined;
}

export class DesktopUpdateService {
  private state: NativeDesktopUpdateState;
  private subscriber: WebContents | null = null;
  private targetVersion: string | null = null;
  private updater: DesktopUpdaterAdapter | null = null;
  private updaterPromise: Promise<DesktopUpdaterAdapter> | null = null;

  constructor(private readonly options: DesktopUpdateServiceOptions) {
    this.state = options.isApplicable() ? IDLE_STATE : NOT_APPLICABLE_STATE;
  }

  getState() {
    return this.state;
  }

  async check(targetVersion: string, sender: WebContents) {
    this.subscriber = sender;
    if (!this.options.isApplicable()) return this.setState(NOT_APPLICABLE_STATE);
    if (this.state.phase === 'checking' || this.state.phase === 'downloading' || this.state.phase === 'ready') {
      return this.state;
    }
    const normalizedVersion = targetVersion.trim();
    if (!normalizedVersion) return this.setInvalidState();
    this.targetVersion = normalizedVersion;
    this.setState({ phase: 'checking', version: normalizedVersion });
    try {
      const updater = await this.ensureUpdater();
      const result = await updater.checkForUpdates();
      if (this.state.phase === 'error') return this.state;
      if (!result || result.updateInfo.version !== normalizedVersion) {
        return this.setState({ phase: 'pending-asset', version: normalizedVersion });
      }
      return this.setState({ phase: 'available', version: normalizedVersion });
    } catch {
      return this.setState({ errorCode: 'check-failed', phase: 'error', version: normalizedVersion });
    }
  }

  async download() {
    if (this.state.phase === 'downloading' || this.state.phase === 'ready') return this.state;
    if (this.state.phase !== 'available' || !this.targetVersion) return this.setInvalidState();
    this.setState({ phase: 'downloading', percent: 0, version: this.targetVersion });
    try {
      const updater = await this.ensureUpdater();
      await updater.downloadUpdate();
      if (this.getState().phase === 'downloading') {
        return this.setState({ phase: 'ready', percent: 100, version: this.targetVersion });
      }
      return this.state;
    } catch {
      return this.setState({ errorCode: 'download-failed', phase: 'error', version: this.targetVersion });
    }
  }

  async install() {
    if (this.state.phase !== 'ready') return this.setInvalidState();
    if (!(await this.options.prepareInstall())) {
      return this.setState({
        errorCode: 'install-preparation-failed',
        phase: 'error',
        version: this.targetVersion ?? undefined
      });
    }
    try {
      const updater = await this.ensureUpdater();
      updater.quitAndInstall(false, true);
      return this.state;
    } catch {
      return this.setState({
        errorCode: 'install-preparation-failed',
        phase: 'error',
        version: this.targetVersion ?? undefined
      });
    }
  }

  private async ensureUpdater() {
    if (this.updater) return this.updater;
    this.updaterPromise ??= this.options.loadUpdater().then((updater) => {
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowDowngrade = false;
      this.bindUpdaterEvents(updater);
      this.updater = updater;
      return updater;
    });
    return this.updaterPromise;
  }

  private bindUpdaterEvents(updater: DesktopUpdaterAdapter) {
    updater.on('download-progress', (progress) => {
      if (this.state.phase !== 'downloading') return;
      this.setState({
        percent: Math.min(100, safeNumber(progress?.percent) ?? 0),
        phase: 'downloading',
        totalBytes: safeNumber(progress?.total),
        transferredBytes: safeNumber(progress?.transferred),
        version: this.targetVersion ?? undefined
      });
    });
    updater.on('update-downloaded', () => {
      this.setState({ phase: 'ready', percent: 100, version: this.targetVersion ?? undefined });
    });
    updater.on('error', () => {
      const errorCode = this.state.phase === 'downloading' ? 'download-failed' : 'check-failed';
      this.setState({ errorCode, phase: 'error', version: this.targetVersion ?? undefined });
    });
  }

  private setInvalidState() {
    return this.setState({
      errorCode: 'invalid-command-state',
      phase: 'error',
      version: this.targetVersion ?? undefined
    });
  }

  private setState(state: NativeDesktopUpdateState) {
    this.state = state;
    if (this.subscriber && !this.subscriber.isDestroyed()) {
      this.subscriber.send(this.options.eventChannel, state);
    }
    return state;
  }
}
