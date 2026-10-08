export interface NativeCompanionFramedPayloadBudgetOwner {
  library_key: string;
  generation_id: string;
}

export interface NativeCompanionFramedPayloadLoan extends NativeCompanionFramedPayloadBudgetOwner {
  loan_id: string;
  direction: 'outbound';
  lane: 'payload';
  capacity_bytes: 2097152;
}

export interface NativeCompanionFramedPayloadBudgetPlugin {
  configureFramedSyncPayloadBudget(args: NativeCompanionFramedPayloadBudgetOwner): Promise<void>;
  closeFramedSyncPayloadBudget(args: NativeCompanionFramedPayloadBudgetOwner): Promise<void>;
  validateFramedSyncPayloadLoan(args: NativeCompanionFramedPayloadLoan): Promise<{ valid: true }>;
  releaseFramedSyncPayloadLoan(args: NativeCompanionFramedPayloadLoan): Promise<void>;
}
