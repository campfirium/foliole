import { readFileSync } from 'node:fs';
import path from 'node:path';

export type DesktopDistributionChannel = 'github' | 'internal' | 'mas';

export function readDesktopDistributionChannel(appPath: string): DesktopDistributionChannel | null {
  try {
    const metadata = JSON.parse(readFileSync(path.join(appPath, 'package.json'), 'utf8')) as Record<string, unknown>;
    const channel = metadata.folioleBuildChannel;
    return channel === 'github' || channel === 'internal' || channel === 'mas' ? channel : null;
  } catch {
    return null;
  }
}
