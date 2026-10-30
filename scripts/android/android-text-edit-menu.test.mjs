// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { macosA5GradleEnv } from './macos-a5-runtime-paths.mjs';

const STUBS = {
  'android/annotation/SuppressLint.java': 'package android.annotation; public @interface SuppressLint { String[] value(); }',
  'android/content/Context.java': 'package android.content; public class Context {}',
  'android/util/AttributeSet.java': 'package android.util; public interface AttributeSet {}',
  'android/view/Menu.java': 'package android.view; public interface Menu { void clear(); }',
  'android/view/MenuItem.java': 'package android.view; public interface MenuItem {}',
  'android/view/ActionMode.java': `package android.view;
    public class ActionMode {
      public interface Callback {
        boolean onCreateActionMode(ActionMode mode, Menu menu);
        boolean onPrepareActionMode(ActionMode mode, Menu menu);
        boolean onActionItemClicked(ActionMode mode, MenuItem item);
        void onDestroyActionMode(ActionMode mode);
      }
    }`,
  'com/getcapacitor/CapacitorWebView.java': `package com.getcapacitor;
    import android.view.ActionMode;
    public class CapacitorWebView {
      public boolean editable;
      public ActionMode.Callback activeCallback;
      public CapacitorWebView(android.content.Context c, android.util.AttributeSet a) {}
      public boolean onCheckIsTextEditor() { return editable; }
      public ActionMode startActionMode(ActionMode.Callback c) { activeCallback=c; return new ActionMode(); }
      public ActionMode startActionMode(ActionMode.Callback c,int type) { activeCallback=c; return new ActionMode(); }
    }`,
  'com/foliole/android/TextMenuHarness.java': `package com.foliole.android;
    import android.view.*;
    import java.util.*;
    public class TextMenuHarness {
      static class TextMenu implements Menu {
        List<String> items = new ArrayList<>();
        public void clear() { items.clear(); }
      }
      public static void main(String[] args) {
        FolioleCompanionWebView view = new FolioleCompanionWebView(null,null);
        view.editable=Boolean.parseBoolean(args[0]);
        TextMenu menu=new TextMenu();
        int[] clicks={0},destroyed={0};
        ActionMode.Callback callback=new ActionMode.Callback() {
          public boolean onCreateActionMode(ActionMode mode,Menu target) {
            menu.items.addAll(Arrays.asList("Cut","Copy","Paste","Select all")); return true;
          }
          public boolean onPrepareActionMode(ActionMode mode,Menu target) {
            menu.items.add("Paste as plain text"); return true;
          }
          public boolean onActionItemClicked(ActionMode mode,MenuItem item) { clicks[0]++; return true; }
          public void onDestroyActionMode(ActionMode mode) { destroyed[0]++; }
        };
        ActionMode mode="typed".equals(args[1]) ? view.startActionMode(callback,1) : view.startActionMode(callback);
        if (!view.activeCallback.onCreateActionMode(mode,menu)) throw new AssertionError("Menu creation rejected");
        if (view.editable && !menu.items.containsAll(Arrays.asList("Cut","Copy","Paste","Select all")))
          throw new AssertionError("Editing menu lost clipboard actions");
        if (!view.editable && !menu.items.isEmpty()) throw new AssertionError("Reading menu duplicates annotation toolbar");
        view.activeCallback.onPrepareActionMode(mode,menu);
        if (view.editable && !menu.items.contains("Paste as plain text")) throw new AssertionError("Menu refresh lost paste");
        if (!view.editable && !menu.items.isEmpty()) throw new AssertionError("Reading menu returned after refresh");
        view.activeCallback.onActionItemClicked(mode,null);
        view.activeCallback.onDestroyActionMode(mode);
        if (clicks[0]!=1 || destroyed[0]!=1) throw new AssertionError("Native callbacks were not forwarded");
        if (view.editable && view.activeCallback!=callback) throw new AssertionError("Editable native callback was replaced");
        System.out.println("menu ready");
      }
    }`
};

it.each(['typed', 'legacy'])('preserves native editing menus and reading actions through the %s entry', (entry) => {
  const parent = path.resolve('.tmp/artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'text-edit-menu-'));
  const javaHome = process.platform === 'darwin' ? macosA5GradleEnv().JAVA_HOME : process.env.JAVA_HOME;
  const binary = name => javaHome ? path.join(javaHome, 'bin', name) : name;
  try {
    const sources = { ...STUBS,
      'com/foliole/android/FolioleCompanionWebView.java': fs.readFileSync(
        'android/app/src/main/java/com/foliole/android/FolioleCompanionWebView.java', 'utf8') };
    const files = Object.entries(sources).map(([name, source]) => {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
      return file;
    });
    execFileSync(binary('javac'), ['-d', root, ...files], { timeout: 30_000, stdio: 'pipe' });
    for (const editable of ['true', 'false']) {
      const result = execFileSync(binary('java'), ['-cp', root, 'com.foliole.android.TextMenuHarness', editable, entry],
        { encoding: 'utf8', timeout: 10_000 });
      expect(result.trim()).toBe('menu ready');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
