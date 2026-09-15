import { useReadwiseAutoSync } from './useReadwiseAutoSync';
import { useReadwiseMigrationRecovery } from './useReadwiseMigrationRecovery';
import { useReleaseUpdateCheck } from './useReleaseUpdateCheck';

export function useAppBackgroundEffects(input: {
  hasReportedAppReady: boolean;
  isDemo: boolean;
}) {
  useReadwiseAutoSync();
  useReleaseUpdateCheck();
  useReadwiseMigrationRecovery(input.hasReportedAppReady && !input.isDemo);
}
