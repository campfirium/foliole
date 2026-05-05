export interface RuntimeMode {
  allowParallelInstance: boolean;
}

export function resolveRuntimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  return {
    allowParallelInstance: env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1'
  };
}
