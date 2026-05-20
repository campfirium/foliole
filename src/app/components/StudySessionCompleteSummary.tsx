import { AppButton } from '../../shared/ui';

export interface StudySessionCompleteSummaryProps {
  completedAt: string | null;
  readTopicCount: number;
  reviewedItemCount: number;
  sessionStartedAt: string | null;
  onContinueReading: () => void;
}

function formatElapsedTime(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) {
    return 'Just now';
  }
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 'Just now';
  }
  const totalMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-border px-4 first:border-l-0 first:pl-0">
      <div className="text-[22px] font-semibold leading-tight text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function StudySessionCompleteSummary({
  completedAt,
  onContinueReading,
  readTopicCount,
  reviewedItemCount,
  sessionStartedAt
}: StudySessionCompleteSummaryProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas px-8 py-10 text-foreground">
      <div className="w-full max-w-[640px]">
        <div className="mb-7">
          <p className="text-sm font-medium text-green-accent">Review queue clear</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight">Review complete</h1>
          <p className="mt-3 max-w-[520px] text-sm leading-6 text-muted-foreground">
            Your due review phase is complete. Continue reading when you are ready.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-0 border-y border-border py-5">
          <SummaryStat label="Reviewed Items" value={String(reviewedItemCount)} />
          <SummaryStat label="Read Topics" value={String(readTopicCount)} />
          <SummaryStat label="Time spent" value={formatElapsedTime(sessionStartedAt, completedAt)} />
        </div>
        <div className="mt-7 flex justify-center">
          <AppButton className="min-w-40 px-5" onClick={onContinueReading} size="md" variant="primary">
            Continue reading
          </AppButton>
        </div>
      </div>
    </div>
  );
}
