package com.youshi.cultivation;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAppUpdatePlugin.class);
        registerPlugin(NativeSystemUiPlugin.class);
        registerPlugin(LocalSafPlugin.class);
        registerPlugin(CloudExportPlugin.class);
        registerPlugin(ImageActionsPlugin.class);
        registerPlugin(InstallHistoryPlugin.class);
        registerPlugin(NativeSharePlugin.class);
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);
        if (bridge != null) {
            bridge.getWebView().setWebViewClient(
                new LifeSpaceWebViewClient(bridge, getAssets())
            );
            android.util.Log.i(
                "LifeSpaceShell",
                "WebView debugging enabled; initial URL: " + bridge.getWebView().getUrl()
            );
        }
        if (Build.VERSION.SDK_INT >= 26) LoginFillUiGuard.attach(this);
    }

    @Override
    public void onDestroy() {
        if (Build.VERSION.SDK_INT >= 26) LoginFillUiGuard.detach(this);
        super.onDestroy();
    }
}
