package com.foliole.android;

import android.os.Debug;
import android.os.SystemClock;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

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
        AtomicReference<RuntimeException> observationFailure = new AtomicReference<>();
        Thread sampler = new Thread(() -> {
            try { sampleMemory(running, peakPss); }
            catch (RuntimeException error) { observationFailure.set(error); }
        }, "foliole-performance-memory");
        sampler.start();
        long startedAt = SystemClock.elapsedRealtime();
        try {
            operation.run();
        } finally {
            running.set(false);
            sampler.join();
        }
        if (observationFailure.get() != null) throw observationFailure.get();
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
        long bytes = info.getTotalPss() * 1024L;
        if (bytes <= 0) throw new IllegalStateException("Process memory was not observed");
        return bytes;
    }
}
