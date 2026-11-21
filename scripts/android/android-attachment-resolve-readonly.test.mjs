// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { jvmStderr } from './jvm-output-fixture.mjs';

const root = path.resolve('android/app/src/main/java/com/foliole/android');

// Minimal Android/Capacitor surfaces so the production resolver compiles on a plain JVM.
const androidStubs = {
  'Context.java': `package android.content;
    public class Context { private final java.io.File files; public Context(java.io.File files) { this.files = files; }
      public java.io.File getFilesDir() { return files; } }`,
  'Uri.java': `package android.net;
    public final class Uri { private final String value; private Uri(String value) { this.value = value; }
      public static Uri fromFile(java.io.File file) { return new Uri("file://" + file.getPath()); }
      @Override public String toString() { return value; } }`,
  'ErrnoException.java': 'package android.system; public class ErrnoException extends Exception {}',
  'StructStat.java': 'package android.system; public final class StructStat { public final int st_mode; public StructStat(int mode) { st_mode = mode; } }',
  'OsConstants.java': 'package android.system; public final class OsConstants { public static boolean S_ISREG(int mode) { return mode == 1; } }',
  'Os.java': `package android.system;
    import java.nio.file.*;
    public final class Os { public static StructStat lstat(String path) throws ErrnoException {
      Path file = Paths.get(path);
      if (!Files.exists(file, LinkOption.NOFOLLOW_LINKS)) throw new ErrnoException();
      return new StructStat(Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) ? 1 : 0); } }`,
  'JSObject.java': `package com.getcapacitor;
    public class JSObject extends java.util.HashMap<String, Object> {
      public JSObject put(String key, Object value) { super.put(key, value); return this; } }`
};

const fixture = `package com.foliole.android;
  import android.content.Context;
  import java.io.File;
  import java.nio.file.Files;
  final class FolioleCompanionCanonicalAttachmentKey {
    static boolean matches(String hash, String mime, String key) { return key.startsWith(hash); }
  }
  final class FolioleCompanionAttachmentResourceHash {
    static String digestHex(Context context, File file) { throw new AssertionError("image display must not hash"); }
  }
  final class FolioleCompanionResourceReadQueryRules {
    static String attachmentResolveResponseKey(Context context, String key) { return key; }
    static String attachmentResolveStatus(Context context, String key) { return key; }
  }
  final class FolioleAttachmentMaintenanceFiles {
    static int moves;
    static File directory(Context context, boolean trash) {
      return new File(context.getFilesDir(), trash ? "attachments.trash" : "attachments");
    }
    static void move(Context context, String key, boolean toTrash) throws Exception {
      moves++;
      File source = new File(directory(context, true), key);
      if (source.isFile()) Files.move(source.toPath(), new File(directory(context, false), key).toPath());
    }
  }
  public class ResolveReadOnlyFixture {
    public static void main(String[] args) throws Exception {
      File files = Files.createTempDirectory("foliole-resolve-").toFile();
      Context context = new Context(files);
      String hash = "a".repeat(64), key = hash + ".png";
      new File(files, "attachments").mkdirs();
      new File(files, "attachments.trash").mkdirs();
      Object absent = FolioleCompanionAttachmentFileResolver.resolve(context, hash, "image/png", key, true).get("status");
      if (!"missingFile".equals(absent)) throw new AssertionError("Absent image status: " + absent);
      if (FolioleAttachmentMaintenanceFiles.moves != 0) throw new AssertionError("Absent image entered the trash move");
      Files.write(new File(files, "attachments.trash/" + key).toPath(), new byte[] {1});
      Object trashed = FolioleCompanionAttachmentFileResolver.resolve(context, hash, "image/png", key, true).get("status");
      if (!"readyStatusKey".equals(trashed)) throw new AssertionError("Trashed image status: " + trashed);
      if (FolioleAttachmentMaintenanceFiles.moves != 1) throw new AssertionError("Trashed image was not restored once");
      if (!new File(files, "attachments/" + key).isFile()) throw new AssertionError("Restored file missing");
      System.out.println("Absent image stayed read-only; trashed image restored");
    }
  }`;

it('resolves an absent image without entering the trash move and still restores a trashed one', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-resolve-readonly-'));
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  try {
    const sources = Object.entries({ ...androidStubs, 'ResolveReadOnlyFixture.java': fixture })
      .map(([name, text]) => { const file = path.join(directory, name); fs.writeFileSync(file, text); return file; });
    const compiled = spawnSync(binary('javac'), ['-d', directory, ...sources,
      path.join(root, 'FolioleCompanionAttachmentFileResolver.java')], { encoding: 'utf8', timeout: 30000 });
    expect(compiled.error ?? jvmStderr(compiled.stderr)).toBe('');
    expect(compiled.status).toBe(0);
    const result = spawnSync(binary('java'), ['-cp', directory, 'com.foliole.android.ResolveReadOnlyFixture'],
      { encoding: 'utf8', timeout: 15000 });
    expect(jvmStderr(result.stderr)).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Absent image stayed read-only; trashed image restored');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
