import { isValidDesktopUpdateVersion } from './desktopUpdateFeed.js';
import { createDesktopUpdateRecord, type DesktopUpdateStateStore } from './desktopUpdateStateStore.js';

function numericVersionParts(version: string) {
  return version.replace(/^v/u, '').split(/[.-]/u).map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, current: string) {
  const candidateParts = numericVersionParts(candidate);
  const currentParts = numericVersionParts(current);
  const count = Math.max(candidateParts.length, currentParts.length, 3);
  for (let index = 0; index < count; index += 1) {
    const difference = (candidateParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export class DesktopUpdateCandidate {
  operationId = 0;
  version: string | null = null;
  private queuedVersion: string | null = null;

  constructor(
    private readonly getInstalledVersion: () => string,
    private readonly stateStore: DesktopUpdateStateStore
  ) {}

  accepts(version: string) {
    return isValidDesktopUpdateVersion(version) && (!this.version || isNewerVersion(version, this.version));
  }

  async activate(version: string, queued = false) {
    if (!this.accepts(version)) return false;
    const previousVersion = this.version;
    const operationId = ++this.operationId;
    this.version = version;
    this.queuedVersion = null;
    try {
      await this.stateStore.write(createDesktopUpdateRecord(
        'discovered', this.getInstalledVersion(), version
      ));
    } catch (error) {
      if (!this.isCurrent(operationId, version)) return false;
      this.version = previousVersion;
      throw error;
    }
    if (!this.isCurrent(operationId, version)) return false;
    this.queuedVersion = queued ? version : null;
    return true;
  }

  restore(version: string) {
    this.operationId += 1;
    this.version = version;
  }

  consumeQueuedVersion() {
    if (!this.queuedVersion || this.queuedVersion !== this.version) return null;
    const version = this.queuedVersion;
    this.queuedVersion = null;
    return version;
  }

  isCurrent(operationId: number, version: string) {
    return this.operationId === operationId && this.version === version;
  }

  clear() {
    this.operationId += 1;
    this.queuedVersion = null;
    this.version = null;
  }
}
