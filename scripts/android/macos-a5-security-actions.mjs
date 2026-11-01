/* global console */
import { runAndroidDependencySecurity } from './android-dependency-security.mjs';
import { recordAndroidDeviceSecurity } from './android-device-security.mjs';

export async function dispatchMacosA5SecurityAction({ action, paths, env, execute, captured, assertFixed, serial }) {
  if (['dependency-security', 'dependency-graph'].includes(action)) {
    await runAndroidDependencySecurity({ paths, env, execute, captured, dependencyGraph: action === 'dependency-graph' });
  }
  if (action === 'security-device') {
    console.log(JSON.stringify(recordAndroidDeviceSecurity({ assertFixed, captured, paths, serial })));
  }
}
