package com.youshi.cultivation;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeSystemUi")
public class NativeSystemUiPlugin extends Plugin {

    @PluginMethod
    public void setStatusBarAppearance(PluginCall call) {
        String colorValue = call.getString("color");
        Boolean darkIconsValue = call.getBoolean("darkIcons", true);

        if (colorValue == null) {
            call.reject("A status bar color is required.");
            return;
        }

        final int color;
        try {
            color = Color.parseColor(colorValue);
        } catch (IllegalArgumentException exception) {
            call.reject("Invalid status bar color.");
            return;
        }

        final boolean darkIcons = Boolean.TRUE.equals(darkIconsValue);

        getBridge().executeOnMainThread(() -> {
            Window window = getActivity().getWindow();
            View decorView = window.getDecorView();

            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

            // Android 15+ forces edge-to-edge for apps targeting current SDKs, so
            // statusBarColor alone is ignored. The exposed inset is painted by the
            // native window / WebView parent instead. Older Android still needs the
            // explicit status-bar color as well.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                window.setStatusBarColor(color);
            }

            decorView.setBackgroundColor(color);
            View webViewParent = (View) getBridge().getWebView().getParent();
            if (webViewParent != null) {
                webViewParent.setBackgroundColor(color);
            }

            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, decorView);
            controller.setAppearanceLightStatusBars(darkIcons);
            call.resolve();
        });
    }
}
