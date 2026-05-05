export interface NativeResolvedAppPaths {
  app_data_dir: string;
  app_config_dir: string;
  app_cache_dir: string;
  app_log_dir: string;
}

export interface NativeSystemFontCatalog {
  fonts: unknown[];
  monospace_fonts: unknown[];
}

export interface NativeSchedulerCard {
  due: string;
  last_review: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
}

export interface NativeReviewGradeArgs {
  request: {
    card: NativeSchedulerCard;
    rating: 'Again' | 'Hard' | 'Good' | 'Easy';
    now: string;
  };
}

export interface NativeReviewPreviewArgs {
  request: {
    card: NativeSchedulerCard;
    now: string;
  };
}

export interface NativeReviewGradeResult {
  card: NativeSchedulerCard;
  reviewed_at: string;
}

export interface NativeReviewPreviewResult {
  Again: NativeReviewGradeResult;
  Hard: NativeReviewGradeResult;
  Good: NativeReviewGradeResult;
  Easy: NativeReviewGradeResult;
}

export interface NativeSqliteBackupResult {
  sourcePath: string;
  destinationPath: string;
  totalPages: number;
  remainingPages: number;
}

export interface NativeSqliteRestoreResult {
  sourcePath: string;
  targetPath: string;
  totalPages: number;
  remainingPages: number;
}
