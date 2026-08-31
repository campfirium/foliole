import type {
  NativeAssistantLoginResult,
  NativeAssistantSendMessageArgs,
  NativeAssistantSendMessageResult,
  NativeAssistantStatusResult,
  NativeAssistantThreadIndexListArgs,
  NativeAssistantThreadIndexMutationArgs,
  NativeAssistantThreadIndexRecord,
  NativeAssistantThreadMessageListArgs,
  NativeAssistantThreadMessageRecord
} from './nativeAssistantContract.js';
import type { NativeAssistantImageContentResult } from './nativeAssistantImageContract.js';
import type { NativeAssistantModelCatalog } from './nativeAssistantModelContract.js';
import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeAssistantCommandMap = {
  [NATIVE_COMMANDS.assistantGetStatus]: { args: undefined; result: NativeAssistantStatusResult };
  [NATIVE_COMMANDS.assistantStartChatGptLogin]: { args: undefined; result: NativeAssistantLoginResult };
  [NATIVE_COMMANDS.assistantListModels]: { args: undefined; result: NativeAssistantModelCatalog };
  [NATIVE_COMMANDS.assistantSendMessage]: {
    args: NativeAssistantSendMessageArgs;
    result: NativeAssistantSendMessageResult;
  };
  [NATIVE_COMMANDS.assistantListThreadIndex]: {
    args: NativeAssistantThreadIndexListArgs | undefined;
    result: NativeAssistantThreadIndexRecord[];
  };
  [NATIVE_COMMANDS.assistantListThreadMessages]: {
    args: NativeAssistantThreadMessageListArgs;
    result: NativeAssistantThreadMessageRecord[];
  };
  [NATIVE_COMMANDS.assistantReadImageAttachment]: {
    args: { attachmentId: string };
    result: NativeAssistantImageContentResult;
  };
  [NATIVE_COMMANDS.assistantArchiveThreadIndex]: {
    args: NativeAssistantThreadIndexMutationArgs;
    result: NativeAssistantThreadIndexRecord;
  };
  [NATIVE_COMMANDS.assistantRemoveThreadFromHistory]: {
    args: NativeAssistantThreadIndexMutationArgs;
    result: NativeAssistantThreadIndexRecord;
  };
};
