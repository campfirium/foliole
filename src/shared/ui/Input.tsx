import type { InputHTMLAttributes } from 'react';

import { Input as ShadcnInput } from '@/components/ui/input';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input(props: InputProps) {
  return <ShadcnInput {...props} />;
}
