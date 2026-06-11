import {
  inspectorDefinitionTermClassName,
  inspectorDefinitionValueClassName
} from '../../shared/ui';

export function PerformanceInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={inspectorDefinitionTermClassName}>{label}</dt>
      <dd className={`${inspectorDefinitionValueClassName} break-all`}>{value}</dd>
    </>
  );
}
