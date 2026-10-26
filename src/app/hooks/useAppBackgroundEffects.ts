import { useReadwiseAutoSync } from './useReadwiseAutoSync';
import { useReadwiseMigrationRecovery } from './useReadwiseMigrationRecovery';
import { useReleaseUpdateCheck } from './useReleaseUpdateCheck';
import { useReviewTrainingIdle } from './useReviewTrainingIdle';

export function useAppBackgroundEffects(input: {
  hasReportedAppReady: boolean;
  isDemo: boolean;
}) {
  useReadwiseAutoSync();
  useReleaseUpdateCheck();
  useReadwiseMigrationRecovery(input.hasReportedAppReady && !input.isDemo);
  useReviewTrainingIdle(input.hasReportedAppReady && !input.isDemo);
}
