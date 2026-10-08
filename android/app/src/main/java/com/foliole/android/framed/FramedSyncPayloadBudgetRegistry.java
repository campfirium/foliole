package com.foliole.android.framed;

/** Lifecycle transitions serialize outside payload locks; no peer or staging-database owners. */
public final class FramedSyncPayloadBudgetRegistry {
    private static volatile FramedSyncPayloadBudget active;
    private static boolean transitioning;

    private FramedSyncPayloadBudgetRegistry() {}

    public static FramedSyncPayloadBudget current() {
        FramedSyncPayloadBudget owner = active;
        if (owner == null) throw new IllegalStateException("framed_sync_payload_budget_unconfigured");
        return owner;
    }

    public static FramedSyncPayloadBudget configure(String library, String generation) throws InterruptedException {
        FramedSyncPayloadBudget replacement = new FramedSyncPayloadBudget(library, generation);
        FramedSyncPayloadBudget previous;
        synchronized (FramedSyncPayloadBudgetRegistry.class) {
            if (transitioning) throw new IllegalStateException("framed_sync_payload_budget_transition_busy");
            previous = active;
            if (matches(previous, library, generation) && !previous.isClosed()) return previous;
            transitioning = true;
            if (previous != null) previous.cancel();
        }
        try {
            if (previous != null) previous.drain();
            synchronized (FramedSyncPayloadBudgetRegistry.class) { active = replacement; }
        } finally {
            synchronized (FramedSyncPayloadBudgetRegistry.class) { transitioning = false; }
        }
        return replacement;
    }

    public static void close(String library, String generation) throws InterruptedException {
        FramedSyncPayloadBudget previous;
        synchronized (FramedSyncPayloadBudgetRegistry.class) {
            if (transitioning) throw new IllegalStateException("framed_sync_payload_budget_transition_busy");
            previous = active;
            if (!matches(previous, library, generation)) return;
            transitioning = true;
            previous.cancel();
        }
        try {
            previous.drain();
            synchronized (FramedSyncPayloadBudgetRegistry.class) { active = null; }
        } finally {
            synchronized (FramedSyncPayloadBudgetRegistry.class) { transitioning = false; }
        }
    }

    public static void cancelCurrent() {
        FramedSyncPayloadBudget owner = active;
        if (owner != null) owner.cancel();
    }

    public static void releaseProducer(String library, String generation, String id,
        FramedSyncPayloadBudget.Direction direction, FramedSyncPayloadBudget.Lane lane, int capacity) {
        FramedSyncPayloadBudget owner = active;
        if (owner != null) owner.releaseProducer(library, generation, id, direction, lane, capacity);
    }

    private static boolean matches(FramedSyncPayloadBudget owner, String library, String generation) {
        return owner != null && owner.libraryKey().equals(library) && owner.generationId().equals(generation);
    }
}
