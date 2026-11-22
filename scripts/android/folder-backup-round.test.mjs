// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { jvmStderr } from './jvm-output-fixture.mjs';

const root = path.resolve('android/app/src/main/java/com/foliole/android');

// Minimal Android/Capacitor surfaces so the production profile compiles on a plain JVM.
const androidStubs = {
  'Context.java': `package android.content;
    public class Context { private final java.io.File files; public Context(java.io.File files) { this.files = files; }
      public java.io.File getFilesDir() { return files; } }`,
  'AtomicFile.java': `package android.util;
    import java.io.*; import java.nio.file.*;
    public class AtomicFile { private final File base; public AtomicFile(File base) { this.base = base; }
      public File getBaseFile() { return base; }
      public byte[] readFully() throws IOException { return Files.readAllBytes(base.toPath()); }
      public FileOutputStream startWrite() throws IOException { return new FileOutputStream(new File(base.getPath() + ".new")); }
      public void finishWrite(FileOutputStream out) throws IOException { out.close();
        Files.move(Paths.get(base.getPath() + ".new"), base.toPath(), StandardCopyOption.REPLACE_EXISTING); }
      public void failWrite(FileOutputStream out) { try { out.close(); } catch (IOException ignored) {} }
      public void delete() { base.delete(); } }`,
  // Line-encoded stand-in for org.json: enough for the profile's string, boolean, number and null fields.
  'JSONObject.java': `package org.json;
    import java.util.*;
    public class JSONObject {
      public static final Object NULL = new Object() { public String toString() { return "null"; } };
      private final Map<String, Object> values = new LinkedHashMap<>();
      public JSONObject() {}
      public JSONObject(String text) { for (String line : text.split("\\n")) { if (line.isEmpty()) continue;
        String[] part = line.split("\\t", 3); String v = part[2].replace("\\\\n", "\\n").replace("\\\\t", "\\t");
        values.put(part[0], part[1].equals("s") ? v : part[1].equals("b") ? (Object) Boolean.valueOf(v)
          : part[1].equals("i") ? (Object) Integer.valueOf(v) : NULL); } }
      public JSONObject put(String key, Object value) throws JSONException { values.put(key, value); return this; }
      public Object remove(String key) { return values.remove(key); }
      public boolean has(String key) { return values.containsKey(key); }
      public boolean isNull(String key) { return !values.containsKey(key) || values.get(key) == NULL; }
      public Object opt(String key) { return values.get(key); }
      public String optString(String key) { return optString(key, ""); }
      public String optString(String key, String fallback) { Object v = values.get(key); return v == null || v == NULL ? fallback : v.toString(); }
      public int optInt(String key, int fallback) { Object v = values.get(key); return v instanceof Integer ? (Integer) v : fallback; }
      public boolean optBoolean(String key) { return Boolean.TRUE.equals(values.get(key)); }
      public String getString(String key) throws JSONException { Object v = values.get(key); if (v == null) throw new JSONException(key); return v.toString(); }
      @Override public String toString() { StringBuilder out = new StringBuilder();
        for (Map.Entry<String, Object> entry : values.entrySet()) { Object v = entry.getValue();
          String type = v instanceof String ? "s" : v instanceof Boolean ? "b" : v instanceof Integer ? "i" : "n";
          out.append(entry.getKey()).append('\\t').append(type).append('\\t')
            .append(String.valueOf(v).replace("\\n", "\\\\n").replace("\\t", "\\\\t")).append('\\n'); }
        return out.toString(); } }`,
  'JSONException.java': 'package org.json; public class JSONException extends Exception { public JSONException(String m) { super(m); } }',
  'JSObject.java': `package com.getcapacitor;
    public class JSObject extends org.json.JSONObject {
      public JSObject put(String key, Object value) { try { super.put(key, value); } catch (Exception e) { throw new RuntimeException(e); } return this; } }`
};

const fixture = `package com.foliole.android;
  import android.content.Context;
  import java.io.File;
  import java.nio.file.Files;
  import java.util.ArrayList;
  import java.util.List;
  public class FolderBackupRoundFixture {
    static final List<String> saved = new ArrayList<>();
    static FolioleFolderBackupRound round(String phase) {
      saved.clear();
      return new FolioleFolderBackupRound(phase, null, (value, error) -> saved.add(value + ":" + error));
    }
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    static void same(Object expected, Object actual, String message) {
      if (expected == null ? actual != null : !expected.equals(actual)) throw new AssertionError(message + ": expected " + expected + " but was " + actual);
    }
    static String rejected(Runnable action) {
      try { action.run(); } catch (RuntimeException error) { return error.getMessage(); }
      throw new AssertionError("Expected a rejection");
    }
    static void ended(FolioleFolderBackupRound value, String phase, String error) {
      FolioleFolderBackupRound round = value;
      check(!round.isOpen(), "Round still open");
      same(phase, round.phase(), "phase"); same(error, round.error(), "error");
      same(phase + ":" + error, saved.get(saved.size() - 1), "persisted state");
    }
    static FolioleFolderBackupRound committed(String epoch, String request) {
      FolioleFolderBackupRound value = round("saved");
      value.open(epoch, true); value.begin(epoch, request); value.started(epoch);
      check(value.databaseEnded(request, true, false), "Committed round closed before attachments");
      return value;
    }
    static FolioleFolderBackupRound round;
    public static void main(String[] args) throws Exception {
      // A page reloads while the previous page's round waits on attachments: the new page reclaims it at once.
      round = committed("page-1", "r1");
      check(round.open("page-2", true), "Reload waited without a running operation");
      ended(round, "pending", FolioleFolderBackupRound.RELOADED);
      round.begin("page-2", "r2");
      check(round.owns("r2"), "Back up now after a reload did not start");

      // A reload during the database operation waits for it, then reports the reload instead of its result.
      for (boolean failed : new boolean[] { false, true }) {
        round = round("saved");
        round.open("page-1", true); round.begin("page-1", "r1"); round.started("page-1");
        check(!round.open("page-2", true), "Reload did not wait for the running operation");
        same("A database backup is already running.", rejected(() -> round.begin("page-1", "r9")),
          "running operation still blocks a new round");
        if (failed) round.databaseFailed("r1", "Backup cancelled.");
        else check(!round.databaseEnded("r1", true, false), "Reclaimed round stayed open");
        ended(round, "pending", FolioleFolderBackupRound.RELOADED);
        check(round.open("page-2", true), "Waiting owner was not registered after the operation ended");
        round.begin("page-2", "r2");
      }

      // A folder picker left open by the old page cannot later release the new page's round.
      round = round("saved");
      round.open("page-1", true); round.begin("page-1", "r1");
      check(round.open("page-2", true), "Reload waited on a picker");
      ended(round, "pending", FolioleFolderBackupRound.RELOADED);
      round.begin("page-2", "r2");
      check(!round.folderChosen("r1", true), "Old picker owned the new round");
      check(round.owns("r2"), "Old picker released the new round");

      // A reload with nothing left over keeps the last result.
      round = round("saved");
      round.open("page-1", true); check(round.open("page-2", true), "Idle reload waited");
      same("saved", round.phase(), "idle reload phase"); check(saved.isEmpty(), "Idle reload persisted a state");

      // Within one page a second owner is still refused, and a second request never touches the open round.
      round = committed("page-1", "r1");
      same("Previous database owner is still open.", rejected(() -> round.open("other", false)), "second owner");
      same("A database backup is already running.", rejected(() -> round.begin("page-1", "r2")), "second request");
      check(round.owns("r1"), "Second request released the open round");
      check(!round.cancel("r2", "other failure", false), "Foreign cancel released the round");
      same("Attachment backup is not ready to finish.", rejected(() -> round.requireFinish("r2", false)), "foreign finish");
      check(round.owns("r1"), "Foreign finish released the round");
      check(!round.cancel("r1", null, true), "Cancel released a round whose attachment copy is still busy");

      // Every caller exit lands in a final phase with its real error.
      round = committed("page-1", "r1"); check(round.cancel("r1", "confirm write refused", false), "cancel");
      ended(round, "failed", "confirm write refused");
      round = committed("page-1", "r1"); check(round.cancel("r1", null, false), "release");
      ended(round, "pending", null);
      round = committed("page-1", "r1"); round.requireFinish("r1", false); round.finished(null, 0);
      ended(round, "saved", null);
      round = committed("page-1", "r1"); round.finished(null, 3); ended(round, "pending", null);
      round = committed("page-1", "r1"); round.finished("provider refused copy", 1); ended(round, "failed", "provider refused copy");
      round = round("saved"); round.open("page-1", true); round.begin("page-1", "r1"); round.started("page-1");
      check(!round.databaseEnded("r1", false, false), "Uncommitted round stayed open");
      ended(round, "pending", null);
      round = round("saved"); round.open("page-1", true); round.begin("page-1", "r1"); round.started("page-1");
      round.databaseFailed("r1", "Cannot read backup directory."); ended(round, "failed", "Cannot read backup directory.");
      round = round("saved"); round.open("page-1", true); check(round.close("page-1"), "close");
      same("Database owner is closed.", rejected(() -> round.begin("page-1", "r1")), "closed owner");

      // A process killed mid-round reopens as an interrupted retry.
      File files = Files.createTempDirectory("foliole-folder-round-").toFile();
      FolioleFolderBackupProfile profile = new FolioleFolderBackupProfile(new Context(files));
      profile.save(new org.json.JSONObject().put("id", "profile").put("tree", "content://tree").put("label", "Backup"));
      profile.status("working", null);
      same("pending", new FolioleFolderBackupProfile(new Context(files)).resumePhase(), "resumed phase");
      same(FolioleFolderBackupRound.INTERRUPTED, profile.load().getString("attachmentError"), "resumed error");
      same("pending", profile.resumePhase(), "resumed twice");
      System.out.println("folder-backup-round-passed");
    }
  }`;

it('ends or reclaims every native folder backup round, including after a page reload or process kill', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-folder-round-'));
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  try {
    const sources = Object.entries({ ...androidStubs, 'FolderBackupRoundFixture.java': fixture })
      .map(([name, text]) => { const file = path.join(directory, name); fs.writeFileSync(file, text); return file; });
    const compiled = spawnSync(binary('javac'), ['-d', directory, ...sources,
      path.join(root, 'FolioleFolderBackupRound.java'), path.join(root, 'FolioleFolderBackupProfile.java')],
    { encoding: 'utf8', timeout: 30000 });
    expect(compiled.error ?? jvmStderr(compiled.stderr)).toBe('');
    expect(compiled.status).toBe(0);
    const result = spawnSync(binary('java'), ['-cp', directory, 'com.foliole.android.FolderBackupRoundFixture'],
      { encoding: 'utf8', timeout: 15000 });
    expect(jvmStderr(result.stderr)).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('folder-backup-round-passed');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
