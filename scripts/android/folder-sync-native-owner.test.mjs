// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

// Only JUnit's assertion/annotation API is supplied locally; the exercised owners and lifecycle are production Java.
const support = {
  'org/junit/Test.java': 'package org.junit; public @interface Test {}',
  'org/junit/After.java': 'package org.junit; public @interface After {}',
  'org/junit/Assert.java': `package org.junit; public class Assert {
    public static void assertTrue(boolean value) { if (!value) throw new AssertionError("Expected true"); }
    public static void assertFalse(boolean value) { if (value) throw new AssertionError("Expected false"); }
    public static void assertArrayEquals(Object[] a, Object[] b) {
      if (!java.util.Arrays.equals(a,b)) throw new AssertionError("Arrays differ");
    }
  }`,
  'com/foliole/android/FolderOwnerHarness.java': `package com.foliole.android;
    public class FolderOwnerHarness { public static void main(String[] args) throws Exception {
      FolioleFolderSyncPathsTest paths = new FolioleFolderSyncPathsTest();
      paths.acceptsOnlyManagedRelativeFiles(); paths.rejectsTraversalAbsoluteUrisAndUnmanagedFiles();
      FolioleFolderSyncLeaseTest first = new FolioleFolderSyncLeaseTest();
      try { first.rejectsAnotherWriterAndStaleLease(); } finally { first.close(); }
      FolioleFolderSyncLeaseTest second = new FolioleFolderSyncLeaseTest();
      try { second.libraryReplacementDrainsQueuedFileWorkBeforeReleasingTheOldOwner(); } finally { second.close(); }
      System.out.println("folder paths and native lifecycle passed");
    } }`
};

it('rejects out-of-scope writes and drains the real native folder owner when the library changes', () => {
  const base = path.resolve('.tmp/artifacts/T692');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'java-owner-'));
  const bin = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name;
  const source = 'android/app/src/main/java/com/foliole/android';
  const tests = 'android/app/src/test/java/com/foliole/android';
  try {
    const files = Object.entries(support).map(([name, content]) => {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      return file;
    });
    files.push(`${source}/FolioleFolderSyncPaths.java`, `${source}/FolioleFolderSyncLease.java`,
      `${source}/framed/FramedSyncPayloadBudget.java`, `${source}/framed/FramedSyncPayloadBudgetRegistry.java`,
      `${tests}/FolioleFolderSyncPathsTest.java`, `${tests}/FolioleFolderSyncLeaseTest.java`);
    execFileSync(bin('javac'), ['-d', root, ...files], { timeout: 30_000, stdio: 'pipe' });
    const output = execFileSync(bin('java'), ['-cp', root, 'com.foliole.android.FolderOwnerHarness'],
      { timeout: 10_000, encoding: 'utf8', stdio: 'pipe' });
    expect(output.trim()).toBe('folder paths and native lifecycle passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
