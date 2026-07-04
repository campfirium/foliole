import { NATIVE_COMMANDS } from './nativeCommands.js';
import type { NativeDiscoursePublishCommandMap } from './nativeDiscoursePublishContract.js';
import type { NativeExternalSearchCommandMap } from './nativeExternalSearchCommandMap.js';
import type { NativeImportCommandMap } from './nativeImportCommandMap.js';
import type { NativeInvokeTuple } from './nativeInvokeTypes.js';
import type { NativeLocalFileCommandMap } from './nativeLocalFileCommandMap.js';
import type { NativeMoveCommandMap } from './nativeMoveCommandMap.js';
import type { NativeNodeCreationMutationSpec, NativeNodeSnapshotBatchMutationSpec, NativeNodeSnapshotMutationSpec } from './nativeNodeMutationContract.js';
import type { NativeReadwiseCommandMap } from './nativeReadwiseCommandMap.js';
import type { NativeRemoteImageCommandMap } from './nativeRemoteImageCommandMap.js';
import type { NativeSearchIndexCommandMap } from './nativeSearchIndexCommandMap.js';
import type {
  NativeApplyReviewGradeArgs, NativeImportClipboardImageAttachmentArgs, NativeImportLocalImageAttachmentArgs,
  NativeImportRemoteImageAttachmentArgs, NativeImportLocalImageAttachmentResult,
  NativeRelearnNodeArgs, NativeReadingProgressSnapshot,
  NativeResetImportDataResult,
  NativeReviewSchedulerSettings,
  NativeWorkspaceBacklink,
  NativeSaveReadingProgressArgs,
  NativeWorkspaceNodeDocument,
  NativeWorkspaceSearchResult,
  NativeWorkspaceSnapshot
} from './nativeStorageContract.js';
import type { NativeSyncCommandMap } from './nativeSyncCommandMap.js';
import type { NativeTrashCommandMap } from './nativeTrashCommandMap.js';
import type { NativeUtilityCommandMap } from './nativeUtilityCommandMap.js';
import type { NativeAttachmentResourceResolution, NativeResolvedAppPaths, NativeReviewGradeArgs, NativeReviewGradeResult, NativeReviewPreviewArgs, NativeReviewPreviewResult, NativeSystemFontCatalog } from './nativeUtilityContract.js';
export type * from './nativeStorageContract.js'; export type * from './nativeDiscoursePublishContract.js'; export type * from './nativeImportContract.js'; export type * from './nativeLocalFileCommandMap.js'; export type * from './nativeNodeMutationContract.js';
export type * from './nativeReadwiseContract.js'; export type * from './nativeUtilityContract.js';
export type * from './nativeSourceDispositionContract.js';

export type NativeCommandMap = NativeUtilityCommandMap & NativeReadwiseCommandMap & NativeExternalSearchCommandMap & NativeDiscoursePublishCommandMap & NativeLocalFileCommandMap & NativeSearchIndexCommandMap & NativeSyncCommandMap & NativeImportCommandMap & NativeRemoteImageCommandMap & NativeMoveCommandMap & NativeTrashCommandMap & {
  [NATIVE_COMMANDS.appGetVersion]: {
    args: undefined;
    result: string;
  };
  [NATIVE_COMMANDS.appendReadingPositionTraceLog]: {
    args: {
      event: string;
      payload?: unknown;
      timestamp: number;
    };
    result: string;
  };
  [NATIVE_COMMANDS.bootReport]: {
    args: {
      stage: string;
      payload?: unknown;
    };
    result: null;
  };
  [NATIVE_COMMANDS.listSystemFonts]: {
    args: undefined;
    result: NativeSystemFontCatalog;
  };
  [NATIVE_COMMANDS.loadLoginItemSettings]: {
    args: undefined;
    result: {
      enabled: boolean;
      effective: boolean;
      supported: boolean;
    };
  };
  [NATIVE_COMMANDS.openExternalUrl]: {
    args: {
      url: string;
    };
    result: null;
  };
  [NATIVE_COMMANDS.openLocalPath]: {
    args: {
      path: string;
    };
    result: null;
  };
  [NATIVE_COMMANDS.openImportRoot]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.importClipboardImageAttachment]: {
    args: NativeImportClipboardImageAttachmentArgs;
    result: NativeImportLocalImageAttachmentResult;
  };
  [NATIVE_COMMANDS.importLocalImageAttachment]: {
    args: NativeImportLocalImageAttachmentArgs;
    result: NativeImportLocalImageAttachmentResult;
  };
  [NATIVE_COMMANDS.importRemoteImageAttachment]: {
    args: NativeImportRemoteImageAttachmentArgs;
    result: NativeImportLocalImageAttachmentResult;
  };
  [NATIVE_COMMANDS.resolveAttachmentResource]: {
    args: {
      attachment_id: string;
    };
    result: NativeAttachmentResourceResolution;
  };
  [NATIVE_COMMANDS.resolveAppPaths]: {
    args: undefined;
    result: NativeResolvedAppPaths;
  };
  [NATIVE_COMMANDS.reviewGrade]: {
    args: NativeReviewGradeArgs;
    result: NativeReviewGradeResult;
  };
  [NATIVE_COMMANDS.reviewPreview]: {
    args: NativeReviewPreviewArgs;
    result: NativeReviewPreviewResult;
  };
  [NATIVE_COMMANDS.syncAppMenuState]: {
    args: {
      enabledCommandIds: string[];
      shortcutAccelerators?: {
        accelerator: string;
        commandId: string;
      }[];
    };
    result: null;
  };
  [NATIVE_COMMANDS.windowClose]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowIsMaximized]: {
    args: undefined;
    result: boolean;
  };
  [NATIVE_COMMANDS.windowMinimize]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowRestartApp]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowRestartDevApp]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowToggleDevTools]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowToggleMaximize]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.loadWorkspaceListSnapshot]: {
    args: { includePdfOpenings?: boolean } | undefined;
    result: NativeWorkspaceSnapshot;
  };
  [NATIVE_COMMANDS.loadNodeDocument]: {
    args: { nodeId: string };
    result: NativeWorkspaceNodeDocument | null;
  };
  [NATIVE_COMMANDS.loadNodeBacklinks]: {
    args: { node_id: string };
    result: NativeWorkspaceBacklink[];
  };
  [NATIVE_COMMANDS.searchWorkspace]: {
    args: { query: string };
    result: NativeWorkspaceSearchResult[];
  };
  [NATIVE_COMMANDS.loadWorkspaceSnapshot]: {
    args: undefined;
    result: NativeWorkspaceSnapshot;
  };
  [NATIVE_COMMANDS.loadAppSettingsState]: {
    args: undefined;
    result: Record<string, string>;
  };
  [NATIVE_COMMANDS.saveAppSettingsState]: {
    args: { settings: Record<string, string> };
    result: null;
  };
  [NATIVE_COMMANDS.saveLoginItemSettings]: {
    args: { enabled: boolean };
    result: {
      enabled: boolean;
      effective: boolean;
      supported: boolean;
    };
  };
  [NATIVE_COMMANDS.loadReviewSchedulerSettings]: {
    args: undefined;
    result: NativeReviewSchedulerSettings;
  };
  [NATIVE_COMMANDS.saveReviewSchedulerSettings]: {
    args: { settings: NativeReviewSchedulerSettings };
    result: NativeReviewSchedulerSettings;
  };
  [NATIVE_COMMANDS.loadReadingProgress]: {
    args: undefined;
    result: NativeReadingProgressSnapshot;
  };
  [NATIVE_COMMANDS.saveReadingProgress]: {
    args: NativeSaveReadingProgressArgs;
    result: null;
  };
  [NATIVE_COMMANDS.resetImportData]: {
    args: undefined;
    result: NativeResetImportDataResult;
  };
  [NATIVE_COMMANDS.createFolder]: NativeNodeCreationMutationSpec;
  [NATIVE_COMMANDS.createTopic]: NativeNodeCreationMutationSpec;
  [NATIVE_COMMANDS.createItem]: NativeNodeCreationMutationSpec;
  [NATIVE_COMMANDS.updateNodeContent]: NativeNodeSnapshotMutationSpec;
  [NATIVE_COMMANDS.updateNodeContentWithAnchors]: NativeNodeSnapshotBatchMutationSpec;
  [NATIVE_COMMANDS.updateNodeReveal]: NativeNodeSnapshotMutationSpec;
  [NATIVE_COMMANDS.flushDirtyNodeSyncVersions]: {
    args: undefined;
    result: string[];
  };
  [NATIVE_COMMANDS.relearnNode]: {
    args: NativeRelearnNodeArgs;
    result: null;
  };
  [NATIVE_COMMANDS.replaceNodeOrder]: {
    args: { nodeIds: string[] };
    result: null;
  };
  [NATIVE_COMMANDS.applyReviewGrade]: {
    args: NativeApplyReviewGradeArgs;
    result: null;
  };
};
export type NativeCommandName = keyof NativeCommandMap;
export type NativeCommandArgs<T extends NativeCommandName> = NativeCommandMap[T]['args'];
export type NativeCommandResult<T extends NativeCommandName> = NativeCommandMap[T]['result'];
export type NativeInvokeRequest<T extends NativeCommandName = NativeCommandName> = import('./nativeInvokeTypes.js').NativeInvokeRequest<NativeCommandMap, T>;
export interface NativeInvoke {
  <T extends NativeCommandName>(command: T, ...args: NativeInvokeTuple<NativeCommandMap, T>): Promise<NativeCommandResult<T>>;
  (command: string, args?: Record<string, unknown>): Promise<unknown>;
}
