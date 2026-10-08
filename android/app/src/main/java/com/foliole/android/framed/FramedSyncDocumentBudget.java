package com.foliole.android.framed;

import java.util.function.Consumer;

/** A navigation marker retires only the previous document's captured product owner. */
public final class FramedSyncDocumentBudget {
    private final Consumer<FramedSyncPayloadBudget> cancelPending;
    private FramedSyncPayloadBudget previous;

    public FramedSyncDocumentBudget(Consumer<FramedSyncPayloadBudget> cancelPending) {
        this.cancelPending = cancelPending;
    }

    public void started(FramedSyncPayloadBudget owner) { previous = owner; }

    public void committed() {
        FramedSyncPayloadBudget captured = previous;
        previous = null;
        invalidate(captured);
    }

    public void gone(FramedSyncPayloadBudget bound) {
        FramedSyncPayloadBudget captured = previous;
        previous = null;
        invalidate(captured);
        if (bound != captured) invalidate(bound);
    }

    private void invalidate(FramedSyncPayloadBudget owner) {
        if (owner == null) return;
        owner.invalidateDocument();
        cancelPending.accept(owner);
    }
}
