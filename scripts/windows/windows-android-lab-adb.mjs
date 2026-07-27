/* global process */

const DEFAULT_ANDROID_LAB_ADB_SERVER_PORT = '5601';
const PORT = /^[1-9][0-9]{1,4}$/u;

export function androidLabAdbServerPort(config = {}, env = process.env) {
  const value = String(config.adbServerPort || env.FOLIOLE_ANDROID_ADB_SERVER_PORT || DEFAULT_ANDROID_LAB_ADB_SERVER_PORT);
  if (!PORT.test(value) || Number(value) > 65535) return DEFAULT_ANDROID_LAB_ADB_SERVER_PORT;
  return value;
}

export function androidLabAdbArgs(config, args, env = process.env) {
  return ['-P', androidLabAdbServerPort(config, env), ...args];
}

export function androidLabAdbEnv(config, env = process.env) {
  const port = androidLabAdbServerPort(config, env);
  return { ...env, ANDROID_ADB_SERVER_PORT: port, FOLIOLE_ANDROID_ADB_SERVER_PORT: port };
}
