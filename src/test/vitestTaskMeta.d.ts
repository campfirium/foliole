import 'vitest';

declare module 'vitest' {
  // Calibrated duration of a test: exceeding it only warns, because runner limits stop hangs only.
  interface TaskMeta {
    calibratedMs?: number;
  }
}
