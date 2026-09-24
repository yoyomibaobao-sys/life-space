package com.youshi.cultivation;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        WebView.setWebContentsDebuggingEnabled(true);
        registerPlugin(NativeAppUpdatePlugin.class);
        registerPlugin(NativeSystemUiPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge != null) {
            bridge.getWebView().setWebViewClient(
                new LifeSpaceWebViewClient(bridge, getAssets())
            );
            android.util.Log.i(
                "LifeSpaceShell",
                "WebView debugging enabled; initial URL: " + bridge.getWebView().getUrl()
            );
        }
    }
}