// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { jvmStderr } from './jvm-output-fixture.mjs';

const root = path.resolve('android/app/src/main/java/com/foliole/android');

// Minimal Android/Capacitor surfaces so the production image writer and file stage compile on a plain JVM.
const stubs = {
  'Context.java': `package android.content;
    public class Context { private final java.io.File files; public Context(java.io.File files) { this.files = files; }
      public java.io.File getFilesDir() { return files; } }`,
  'ErrnoException.java': 'package android.system; public class ErrnoException extends Exception { public int errno = OsConstants.ENOENT; }',
  'StructStat.java': 'package android.system; public final class StructStat { public final int st_mode; public StructStat(int mode) { st_mode = mode; } }',
  'OsConstants.java': `package android.system; public final class OsConstants {
    public static final int ENOENT = 2; public static boolean S_ISLNK(int mode) { return mode == 3; } }`,
  'Os.java': `package android.system;
    import java.nio.file.*;
    public final class Os { public static StructStat lstat(String path) throws ErrnoException {
      Path file = Paths.get(path);
      if (!Files.exists(file, LinkOption.NOFOLLOW_LINKS)) throw new ErrnoException();
      return new StructStat(Files.isSymbolicLink(file) ? 3 : 1); } }`,
  'Base64.java': `package android.util; public final class Base64 { public static final int DEFAULT = 0, NO_WRAP = 2;
    public static byte[] decode(String value, int flags) { return java.util.Base64.getDecoder().decode(value); }
    public static String encodeToString(byte[] value, int flags) { return java.util.Base64.getEncoder().encodeToString(value); } }`,
  'Log.java': 'package android.util; public final class Log { public static int d(String tag, String message) { return 0; } }',
  'JSObject.java': `package com.getcapacitor;
    public class JSObject extends java.util.HashMap<String, Object> {
      public JSObject put(String key, Object value) { super.put(key, value); return this; } }`,
  'PluginCall.java': `package com.getcapacitor;
    public class PluginCall { private final java.util.Map<String, String> data;
      public PluginCall(java.util.Map<String, String> data) { this.data = data; }
      public String getString(String key) { return data.get(key); } }`
};

const fixture = `package com.foliole.android;
  import android.content.Context;
  import com.getcapacitor.PluginCall;
  import java.io.File;
  import java.nio.file.Files;
  import java.security.MessageDigest;
  final class BuildConfig { static final boolean DEBUG = false; }
  final class FolioleCompanionCanonicalAttachmentKey {
    static boolean matches(String hash, String mime, String key) { return key.equals(hash + ".png"); }
  }
  final class FolioleCompanionAttachmentResourceHash {
    static int fileDigests;
    static String digestHex(Context context, File file) throws Exception { return digestHex(file); }
    static String digestHex(File file) throws Exception { fileDigests++; return hex(Files.readAllBytes(file.toPath())); }
    static String hex(byte[] bytes) throws Exception {
      StringBuilder value = new StringBuilder();
      for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format("%02x", item));
      return value.toString();
    }
  }
  final class FolioleAttachmentBlockFiles {
    static File checkedSourceFile(File file) { return file; }
    static boolean publish(Context context, File source, File target, String hash) throws Exception {
      return FolioleCompanionAttachmentFileStage.publishVerified(source, target, hash);
    }
    static boolean publishHashed(Context context, File source, File target, String hash) throws Exception {
      return FolioleCompanionAttachmentFileStage.publishHashed(source, target, hash);
    }
  }
  public class RemoteImagePublishFixture {
    public static void main(String[] args) throws Exception {
      File files = Files.createTempDirectory("foliole-remote-image-").toFile();
      Context context = new Context(files);
      byte[] bytes = new byte[256 * 1024];
      for (int index = 0; index < bytes.length; index++) bytes[index] = (byte) index;
      String hash = FolioleCompanionAttachmentResourceHash.hex(bytes);
      java.util.Map<String, String> data = new java.util.HashMap<>();
      data.put("bytesBase64", java.util.Base64.getEncoder().encodeToString(bytes));
      data.put("contentHash", hash); data.put("storageKey", hash + ".png"); data.put("mimeType", "image/png");
      Object created = FolioleRemoteImageFiles.write(context, new PluginCall(data)).get("storedFile");
      if (!"created".equals(created)) throw new AssertionError("First write: " + created);
      if (FolioleCompanionAttachmentResourceHash.fileDigests != 0) {
        throw new AssertionError("Written image was hashed again from disk: " + FolioleCompanionAttachmentResourceHash.fileDigests);
      }
      if (!java.util.Arrays.equals(bytes, Files.readAllBytes(new File(files, "attachments/" + hash + ".png").toPath()))) {
        throw new AssertionError("Stored bytes differ");
      }
      Object reused = FolioleRemoteImageFiles.write(context, new PluginCall(data)).get("storedFile");
      if (!"reused".equals(reused) || FolioleCompanionAttachmentResourceHash.fileDigests != 1) {
        throw new AssertionError("Existing image must still be checked once: " + reused);
      }
      Files.write(new File(files, "attachments/" + hash + ".png").toPath(), new byte[] {1, 2, 3});
      try { FolioleRemoteImageFiles.write(context, new PluginCall(data)); throw new AssertionError("Damaged image reused"); }
      catch (IllegalArgumentException expected) {
        if (!"Existing image differs".equals(expected.getMessage())) throw expected;
      }
      System.out.println("New image published without a disk digest; existing image still checked");
    }
  }`;

it('publishes a hashed remote image without re-reading it and still checks an existing image', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-remote-image-publish-'));
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  try {
    const sources = Object.entries({ ...stubs, 'RemoteImagePublishFixture.java': fixture })
      .map(([name, text]) => { const file = path.join(directory, name); fs.writeFileSync(file, text); return file; });
    const compiled = spawnSync(binary('javac'), ['-d', directory, ...sources,
      path.join(root, 'FolioleRemoteImageFiles.java'), path.join(root, 'FolioleCompanionAttachmentFileStage.java')],
    { encoding: 'utf8', timeout: 30000 });
    expect(compiled.error).toBeUndefined();
    expect(compiled.stderr).not.toMatch(/error/u);
    expect(compiled.status).toBe(0);
    const result = spawnSync(binary('java'), ['-cp', directory, 'com.foliole.android.RemoteImagePublishFixture'],
      { encoding: 'utf8', timeout: 15000 });
    expect(jvmStderr(result.stderr)).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('New image published without a disk digest; existing image still checked');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
