// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import { expect, it } from 'vitest';

import { macosA5GradleEnv } from './macos-a5-runtime-paths.mjs';

const STUBS = {
  'android/os/Build.java': `package android.os; public class Build {
    public static class VERSION { public static int SDK_INT = 35; }
    public static class VERSION_CODES { public static final int Q = 29; }
  }`,
  'android/graphics/Rect.java': `package android.graphics; public class Rect {
    public int left, top, right, bottom;
    public Rect(int l,int t,int r,int b) { left=l;top=t;right=r;bottom=b; }
    public boolean contains(int x,int y) { return x>=left && x<right && y>=top && y<bottom; }
    public boolean intersect(int l,int t,int r,int b) {
      left=Math.max(left,l); top=Math.max(top,t); right=Math.min(right,r); bottom=Math.min(bottom,b);
      return left<right && top<bottom;
    }
  }`,
  'android/view/View.java': `package android.view;
    import android.graphics.Rect;
    import java.util.*;
    public class View {
      public int x,y,width,height;
      public List<OnLayoutChangeListener> listeners = new ArrayList<>();
      private List<Rect> exclusions = new ArrayList<>();
      public interface OnLayoutChangeListener {
        void onLayoutChange(View v,int l,int t,int r,int b,int ol,int ot,int or,int ob);
      }
      public int getWidth() { return width; }
      public int getHeight() { return height; }
      public void getLocationInWindow(int[] point) { point[0]=x;point[1]=y; }
      public void setSystemGestureExclusionRects(List<Rect> rects) { exclusions=new ArrayList<>(rects); }
      public List<Rect> getSystemGestureExclusionRects() { return exclusions; }
      public void addOnLayoutChangeListener(OnLayoutChangeListener listener) { listeners.add(listener); }
      public void removeOnLayoutChangeListener(OnLayoutChangeListener listener) { listeners.remove(listener); }
      public void layout(int l,int t,int r,int b) {
        int ox=x,oy=y,ow=width,oh=height; x=l;y=t;width=r-l;height=b-t;
        for(OnLayoutChangeListener listener:new ArrayList<>(listeners))
          listener.onLayoutChange(this,l,t,r,b,ox,oy,ox+ow,oy+oh);
      }
    }`
};

it('keeps Flow edge ownership independent of WebView selection and layout', () => {
  const parent = path.resolve('.tmp/artifacts/T644');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'native-gesture-'));
  const javaHome = process.platform === 'darwin' ? macosA5GradleEnv().JAVA_HOME : process.env.JAVA_HOME;
  const binary = name => javaHome ? path.join(javaHome, 'bin', name) : name;
  try {
    const sources = { ...STUBS,
      'com/foliole/android/FlowGestureHarness.java': fs.readFileSync(
        new URL('./fixtures/flow-gesture-region.java.template', import.meta.url), 'utf8'),
      'com/foliole/android/FolioleFlowGestureRegion.java': fs.readFileSync(
        'android/app/src/main/java/com/foliole/android/FolioleFlowGestureRegion.java', 'utf8') };
    const files = Object.entries(sources).map(([name, source]) => {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
      return file;
    });
    execFileSync(binary('javac'), ['-d', root, ...files], { timeout: 30_000, stdio: 'pipe' });
    for (const scenario of ['selection', 'layout', 'late-layout', 'disable', 'destroy']) {
      const output = execFileSync(binary('java'), ['-cp', root, 'com.foliole.android.FlowGestureHarness', scenario],
        { encoding: 'utf8', timeout: 10_000 });
      expect(output.trim()).toBe('passed');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
