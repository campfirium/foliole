export interface NativeResolvedAppPaths {
  app_data_dir: string;
  app_config_dir: string;
  app_cache_dir: string;
  app_log_dir: string;
}

export interface NativePerformanceMemorySnapshot {
  main_process_rss_bytes: number;
}

export type NativeLibraryPathLocation = 'library_home' | 'assets_dir' | 'inbox' | 'mirror';

export interface NativeLibraryPaths {
  assets_dir: string;
  data_dir: string;
  database_path: string;
  inbox: string;
  library_home: string;
  mirror: string;
  updated_at: string;
}

export interface NativeUpdateLibraryPathSettingArgs {
  location: NativeLibraryPathLocation;
  path: string | null;
}

export interface NativeMirrorOutputRebuildResult {
  queued_article_count: number;
  rebuilt_article_count: number;
  failed_article_count: number;
  pending_article_count: number;
  updated_at: string;
}

export interface NativeMirrorAttachmentLinkRebuildResult {
  scanned_document_count: number;
  rewritten_document_count: number;
  rewritten_link_count: number;
  updated_at: string;
}

export type NativeAttachmentResourceResolution =
  | {
      status: 'ready';
      mime_type: string | null;
      resource_url: string;
    }
  | {
      status: 'not_found';
      resource_url: null;
    }
  | {
      status: 'missing_file';
      mime_type: string | null;
      resource_url: null;
    };

export type NativeCopyAttachmentImageResult =
  | {
      status: 'copied';
    }
  | {
      status: 'not_found' | 'missing_file' | 'invalid_image';
    };

export type NativeExportAttachmentImageResult =
  | {
      status: 'saved';
      path: string;
    }
  | {
      status: 'cancelled';
      path: null;
    }
  | {
      status: 'not_found' | 'missing_file' | 'save_failed';
      path: null;
    };

export type NativeExportCurrentArticleMirrorResult =
  | {
      status: 'saved';
      path: string;
    }
  | {
      status: 'cancelled';
      path: null;
    }
  | {
      status: 'not_found' | 'save_failed';
      path: null;
    };

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

export interface NativeBackupSettings {
  auto_daily_days: number;
  auto_hourly_hours: number;
  auto_monthly_months: number;
  auto_weekly_weeks: number;
  backup_dir: string;
  manual_max_count: number;
  snapshot_max_count: number;
  total_size_limit_bytes: number;
  updated_at: string;
}

export interface NativeSqliteBackupEntry {
  fileName: string;
  filePath: string;
  kind: 'manual' | 'automatic' | 'snapshot';
  autoFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | null;
  snapshotReason: 'pre-migration' | 'pre-restore' | null;
  sizeBytes: number;
  updatedAt: string;
}

export interface NativeSqliteRestoreResult {
  sourcePath: string;
  targetPath: string;
  totalPages: number;
  remainingPages: number;
}
