package com.foliole.android;

import android.os.Debug;
import android.os.SystemClock;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

final class FoliolePerformanceMeasurement {
    interface Operation { void run() throws Exception; }

    final long elapsedMs;
    final long peakDeltaBytes;

    private FoliolePerformanceMeasurement(long elapsedMs, long peakDeltaBytes) {
        this.elapsedMs = elapsedMs;
        this.peakDeltaBytes = peakDeltaBytes;
    }

    static FoliolePerformanceMeasurement measure(Operation operation) throws Exception {
        long initialPss = totalPssBytes();
        AtomicLong peakPss = new AtomicLong(initialPss);
        AtomicBoolean running = new AtomicBoolean(true);
        Thread sampler = new Thread(() -> sampleMemory(running, peakPss), "foliole-performance-memory");
        sampler.start();
        long startedAt = SystemClock.elapsedRealtime();
        try {
            operation.run();
        } finally {
            running.set(false);
            sampler.join();
        }
        return new FoliolePerformanceMeasurement(
            SystemClock.elapsedRealtime() - startedAt,
            Math.max(0, peakPss.get() - initialPss)
        );
    }

    private static void sampleMemory(AtomicBoolean running, AtomicLong peakPss) {
        while (running.get()) {
            peakPss.accumulateAndGet(totalPssBytes(), Math::max);
            SystemClock.sleep(5);
        }
        peakPss.accumulateAndGet(totalPssBytes(), Math::max);
    }

    private static long totalPssBytes() {
        Debug.MemoryInfo info = new Debug.MemoryInfo();
        Debug.getMemoryInfo(info);
        return info.getTotalPss() * 1024L;
    }
}
