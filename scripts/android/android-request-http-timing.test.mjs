// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

let directory;
let java;
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-http-timing-'));
  const write = (name, source) => {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  };
  write('android/content/Context.java', `package android.content;
    public class Context { private final java.io.File root;
      public Context(java.io.File root) { this.root = root; }
      public java.io.File getNoBackupFilesDir() { return root; } }`);
  write('android/system/Os.java', `package android.system;
    public class Os {
      public static java.io.FileDescriptor open(String p, int f, int m) { throw new UnsupportedOperationException(); }
      public static void close(java.io.FileDescriptor d) { throw new UnsupportedOperationException(); }
      public static void fsync(java.io.FileDescriptor d) { throw new UnsupportedOperationException(); }
      public static void rename(String a, String b) { throw new UnsupportedOperationException(); } }`);
  write('android/system/OsConstants.java', 'package android.system; public class OsConstants { public static final int O_RDONLY = 0; }');
  write('com/getcapacitor/JSObject.java', 'package com.getcapacitor; public class JSObject { public void put(String name, Object value) {} }');
  write('android/util/Log.java', `package android.util;
    public class Log { public static final java.util.List<String> lines = new java.util.ArrayList<>();
      public static int d(String tag, String line) { lines.add(line); return 0; } }`);
  write('com/foliole/android/HttpTimingFixture.java', fs.readFileSync(
    new URL('./fixtures/http-request-timing.java.template', import.meta.url), 'utf8'));
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  java = binary('java');
  const production = path.resolve('android/app/src/main/java');
  const compile = spawnSync(binary('javac'), ['-d', directory, '-sourcepath',
    [directory, production].join(path.delimiter), path.join(directory, 'com/foliole/android/HttpTimingFixture.java')],
  { encoding: 'utf8', timeout: 30000 });
  expect(compile.error).toBeUndefined();
  expect(compile.status, compile.stderr).toBe(0);
});
afterAll(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

it.each([4096, 100000])('preserves a %i-byte HTTP body and distinguishes a blocked renewal from output waits', size => {
  for (const blocked of [false, true]) {
    const run = spawnSync(java, ['-cp', directory, 'com.foliole.android.HttpTimingFixture', String(blocked), String(size)],
      { encoding: 'utf8', timeout: 5000 });
    expect(run.error).toBeUndefined();
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('HTTP bytes, phase timing and metadata privacy verified');
  }
});
