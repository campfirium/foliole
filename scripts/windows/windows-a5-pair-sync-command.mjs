import {
  classifyPairSyncRecoveryActionFailure, pairSyncRecoveryFailure
} from './windows-a5-pair-sync-recovery-contract.mjs';

export async function checkedPairSyncCommand(execute, command, args, commandOptions, stage) {
  let result;
  try { result = await execute(command, args, commandOptions); }
  catch (error) {
    const failureResult = error?.result ?? error;
    throw classifyPairSyncRecoveryActionFailure(
      pairSyncRecoveryFailure(error.message, stage, failureResult), stage, failureResult?.output
    );
  }
  if (result.code === 0) return result;
  const failure = pairSyncRecoveryFailure(
    result.lines?.at(-1) || `${command} exited ${result.code}`, stage, result
  );
  throw classifyPairSyncRecoveryActionFailure(failure, stage, result.output);
}
