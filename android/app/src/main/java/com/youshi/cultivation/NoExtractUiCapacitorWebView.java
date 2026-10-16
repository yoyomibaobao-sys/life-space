package com.youshi.cultivation;

import android.content.Context;
import android.os.Looper;
import android.util.AttributeSet;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import com.getcapacitor.CapacitorWebView;

/**
 * Keeps the app visible when an Android IME offers a full-screen editor.
 * Some Huawei keyboard modes otherwise place an extracted-text panel above
 * the keyboard and make it look as if the login page is being covered.
 *
 * On the cloud-login page, edits are observed without changing key delivery.
 * The UI thread alone checks the page before hiding later autofill popups;
 * the IME thread never calls WebView methods.
 */
public final class NoExtractUiCapacitorWebView extends CapacitorWebView {
    private final LoginFillUiPolicy loginFillUiPolicy = new LoginFillUiPolicy();

    public NoExtractUiCapacitorWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public boolean suppressLoginFillUi() {
        if (!isCloudLoginPage()) return false;
        return loginFillUiPolicy.suppressFillUi();
    }

    private boolean isCloudLoginPage() {
        // WebView.getUrl() is never called from an IME thread.
        if (Looper.myLooper() != Looper.getMainLooper()) return false;
        String url = getUrl();
        if (url != null && url.endsWith("#cloud-login")) return true;
        loginFillUiPolicy.reset();
        return false;
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection inputConnection = super.onCreateInputConnection(outAttrs);

        if (outAttrs != null) {
            outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_FULLSCREEN;
            outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_EXTRACT_UI;
            if (inputConnection != null && isCloudLoginPage()
                && LoginFillUiPolicy.isLoginInputType(outAttrs.inputType)) {
                int generation = loginFillUiPolicy.onEditorStarted(outAttrs.inputType);
                return new LoginFieldEditConnection(inputConnection, loginFillUiPolicy, generation);
            }
            // A non-login editor (such as a CAPTCHA field) must not inherit
            // the previous login editor's popup suppression.
            loginFillUiPolicy.reset();
        }

        return inputConnection;
    }

    private static final class LoginFieldEditConnection extends InputConnectionWrapper {
        private final LoginFillUiPolicy fillUiPolicy;
        private final int editorGeneration;

        LoginFieldEditConnection(InputConnection target, LoginFillUiPolicy fillUiPolicy, int editorGeneration) {
            super(target, true);
            this.fillUiPolicy = fillUiPolicy;
            this.editorGeneration = editorGeneration;
        }

        @Override
        public boolean sendKeyEvent(KeyEvent event) {
            if (event != null && event.getKeyCode() == KeyEvent.KEYCODE_DEL
                && event.getAction() == KeyEvent.ACTION_DOWN) noteUserEdit();
            return super.sendKeyEvent(event);
        }

        @Override
        public boolean commitText(CharSequence text, int newCursorPosition) {
            noteUserEdit();
            return super.commitText(text, newCursorPosition);
        }

        @Override
        public boolean deleteSurroundingText(int beforeLength, int afterLength) {
            noteUserEdit();
            return super.deleteSurroundingText(beforeLength, afterLength);
        }

        @Override
        public boolean deleteSurroundingTextInCodePoints(int beforeLength, int afterLength) {
            noteUserEdit();
            return super.deleteSurroundingTextInCodePoints(beforeLength, afterLength);
        }

        private void noteUserEdit() {
            fillUiPolicy.onUserEdit(editorGeneration);
        }
    }
}
