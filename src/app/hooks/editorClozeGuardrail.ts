export { resolveLongClozeGuardAction, type LongClozeGuardAction } from '../../shared/selectionClozeGuard';

export interface LongClozeGuardOptions {
  onRemind?: () => void;
  skipGuard?: boolean;
}
