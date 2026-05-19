// @vitest-environment node
import { beforeEach, expect, it } from 'vitest';

import { handleInvokeRequest, resetCommandsSettingsTestDoubles } from './commands.settings.testSupport.js';

beforeEach(() => {
  resetCommandsSettingsTestDoubles();
});

it('handles review scheduler storage commands', async () => {
  await expect(handleInvokeRequest({ command: 'load_review_scheduler_settings' })).resolves.toMatchObject({
    desiredRetention: 0.9
  });
  await expect(
    handleInvokeRequest({
      command: 'save_review_scheduler_settings',
      args: {
        settings: {
          desiredRetention: 0.8,
          maximumIntervalDays: 180,
          enableShortTerm: true,
          pushQueue: {
            priorityRatio: 7,
            queueMixRatio: { reading: 2, fsrs: 4 },
            readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
          }
        }
      }
    })
  ).resolves.toMatchObject({
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableShortTerm: true,
    pushQueue: {
      priorityRatio: 7,
      queueMixRatio: { reading: 2, fsrs: 4 },
      readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
    }
  });
}, 15000);
