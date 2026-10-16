package com.youshi.cultivation;

import android.app.Activity;
import android.annotation.TargetApi;
import android.os.Build;
import android.view.View;
import android.view.autofill.AutofillManager;
import java.lang.ref.WeakReference;

/**
 * Hides a login autofill popup that appears again while the user is editing.
 *
 * Android shows that popup in a focused window titled "Autofill UI" and marks
 * the input method as not needed, which closes the soft keyboard. This
 * experiment invokes notifyViewExited only during cloud-login editing.
 * Autofill suggestions and save behavior still require device verification.
 * The callback runs on the UI thread (API 26+).
 */
final class LoginFillUiGuard {
    private static AutofillManager.AutofillCallback callback;

    private LoginFillUiGuard() {}

    static void attach(Activity activity) {
        if (Build.VERSION.SDK_INT < 26) return;
        AutofillManager manager = activity.getSystemService(AutofillManager.class);
        if (manager == null) return;
        if (callback != null) manager.unregisterCallback(callback);
        callback = new HideWhileEditing(activity);
        manager.registerCallback(callback);
    }

    static void detach(Activity activity) {
        if (Build.VERSION.SDK_INT < 26 || callback == null) return;
        AutofillManager manager = activity.getSystemService(AutofillManager.class);
        if (manager != null) manager.unregisterCallback(callback);
        callback = null;
    }

    @TargetApi(26)
    private static final class HideWhileEditing extends AutofillManager.AutofillCallback {
        private final WeakReference<Activity> activityRef;

        HideWhileEditing(Activity activity) {
            activityRef = new WeakReference<>(activity);
        }

        @Override
        public void onAutofillEvent(View view, int event) {
            if (event == EVENT_INPUT_SHOWN) hide(view, -1);
        }

        @Override
        public void onAutofillEvent(View view, int virtualId, int event) {
            if (event == EVENT_INPUT_SHOWN) hide(view, virtualId);
        }

        private void hide(View view, int virtualId) {
            if (!(view instanceof NoExtractUiCapacitorWebView)) return;
            NoExtractUiCapacitorWebView webView = (NoExtractUiCapacitorWebView) view;
            if (!webView.suppressLoginFillUi()) return;
            Activity activity = activityRef.get();
            if (activity == null) return;
            AutofillManager manager = activity.getSystemService(AutofillManager.class);
            if (manager == null) return;
            if (virtualId >= 0) {
                manager.notifyViewExited(webView, virtualId);
            } else {
                manager.notifyViewExited(webView);
            }
        }
    }
}
