package com.foliole.android;

import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.foliole.android.framed.FramedSyncDocumentBudget;
import com.getcapacitor.WebViewListener;

/** Retire the captured document's product bridge after replacement commits. */
final class FolioleCompanionFramedSyncDocumentLifecycle extends WebViewListener {
    private final FolioleCompanionFramedSyncPayloadBudgetActions budgets;
    private final FramedSyncDocumentBudget document;

    FolioleCompanionFramedSyncDocumentLifecycle(FolioleCompanionFramedSyncPayloadBudgetActions budgets,
        FolioleCompanionSyncGroupDataBridge requests) {
        this.budgets = budgets;
        document = new FramedSyncDocumentBudget(requests::cancelOwnerPending);
    }

    void destroyed() { document.gone(budgets.configuredOwner()); }

    @Override public void onPageStarted(WebView view) { document.started(budgets.configuredOwner()); }
    @Override public void onPageCommitVisible(WebView view, String url) { document.committed(); }
    @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        document.gone(budgets.configuredOwner());
        return false;
    }
}
