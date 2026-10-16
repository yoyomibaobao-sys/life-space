package com.youshi.cultivation;

/**
 * Decides when a login field may show the system autofill popup again.
 *
 * The first suggestion list stays available. After the user edits that field,
 * later popups are suppressed until focus moves to another login field or
 * the guard leaves the cloud-login page. Whether the Android save prompt is
 * preserved needs physical device verification.
 *
 * This class does not touch a WebView. Both the input thread and the UI
 * thread may call it.
 */
public final class LoginFillUiPolicy {
    private static final int TYPE_MASK_CLASS = 0x0f;
    private static final int TYPE_CLASS_TEXT = 0x01;
    private static final int TYPE_MASK_VARIATION = 0x0ff0;
    private int generation;
    private int loginVariation = Integer.MIN_VALUE;
    private boolean suppressFillUi;

    public synchronized int onEditorStarted(int inputType) {
        if (!isLoginInputType(inputType)) {
            loginVariation = Integer.MIN_VALUE;
            suppressFillUi = false;
            generation++;
            return generation;
        }
        int variation = inputType & TYPE_MASK_VARIATION;
        if (variation != loginVariation) {
            loginVariation = variation;
            suppressFillUi = false;
            generation++;
        }
        return generation;
    }

    public static boolean isLoginInputType(int inputType) {
        if ((inputType & TYPE_MASK_CLASS) != TYPE_CLASS_TEXT) return false;
        int variation = inputType & TYPE_MASK_VARIATION;
        return variation == 0x20 || variation == 0xd0
            || variation == 0x80 || variation == 0xe0 || variation == 0x90;
    }

    public synchronized void reset() {
        loginVariation = Integer.MIN_VALUE;
        suppressFillUi = false;
        generation++;
    }

    public synchronized void onUserEdit(int editorGeneration) {
        if (editorGeneration == generation && loginVariation != Integer.MIN_VALUE) {
            suppressFillUi = true;
        }
    }

    public synchronized boolean suppressFillUi() {
        return suppressFillUi;
    }
}
