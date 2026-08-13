package com.youshi.cultivation;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import com.getcapacitor.CapacitorWebView;

/**
 * Keeps the app visible when an Android IME offers a full-screen editor.
 * Some Huawei keyboard modes otherwise place an extracted-text panel above
 * the keyboard and make it look as if the login page is being covered.
 */
public final class NoExtractUiCapacitorWebView extends CapacitorWebView {

    public NoExtractUiCapacitorWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection inputConnection = super.onCreateInputConnection(outAttrs);

        if (outAttrs != null) {
            outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_FULLSCREEN;
            outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_EXTRACT_UI;
        }

        return inputConnection;
    }
}
