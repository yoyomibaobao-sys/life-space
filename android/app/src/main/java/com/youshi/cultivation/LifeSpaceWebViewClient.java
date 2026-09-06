package com.youshi.cultivation;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Preserves local-only data created by signed RC builds when the cloud shell
 * moves from its generated Workers host to the production domain.
 *
 * The legacy bridge document is always read from the APK asset bundle. No
 * request is sent to workers.dev. Its origin is retained only because Android
 * WebView scopes IndexedDB by origin.
 */
public final class LifeSpaceWebViewClient extends BridgeWebViewClient {

    private static final String LEGACY_LOCAL_STORAGE_HOST =
        "life-space-canary.yoyomibaobao.workers.dev";
    private static final String LEGACY_BRIDGE_PATH =
        "/__lifespace_local_bridge_v1__.html";

    private final AssetManager assets;

    public LifeSpaceWebViewClient(Bridge bridge, AssetManager assets) {
        super(bridge);
        this.assets = assets;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(
        WebView view,
        WebResourceRequest request
    ) {
        Uri uri = request.getUrl();
        if (
            "https".equalsIgnoreCase(uri.getScheme()) &&
            LEGACY_LOCAL_STORAGE_HOST.equalsIgnoreCase(uri.getHost()) &&
            LEGACY_BRIDGE_PATH.equals(uri.getPath())
        ) {
            try {
                InputStream stream = assets.open("public/legacy-local-bridge.html");
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                return new WebResourceResponse(
                    "text/html",
                    "UTF-8",
                    200,
                    "OK",
                    headers,
                    stream
                );
            } catch (IOException ignored) {
                // Fall through to Capacitor's normal handling. The migration
                // caller will time out safely and can retry on the next launch.
            }
        }

        return super.shouldInterceptRequest(view, request);
    }
}
