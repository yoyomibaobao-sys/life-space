package com.youshi.cultivation;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean networkCallbackRegistered = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAppUpdatePlugin.class);
        registerPlugin(NativeSystemUiPlugin.class);
        super.onCreate(savedInstanceState);

        connectivityManager =
            (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);

        if (bridge != null) {
            bridge.getWebView().setWebViewClient(
                new LifeSpaceWebViewClient(bridge, getAssets())
            );
            registerNetworkCallback();
            showOfflineIfNeeded();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        showOfflineIfNeeded();
    }

    @Override
    protected void onDestroy() {
        if (
            connectivityManager != null &&
            networkCallback != null &&
            networkCallbackRegistered
        ) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (IllegalArgumentException ignored) {
                // The callback may already have been removed by Android.
            }
        }
        networkCallbackRegistered = false;
        super.onDestroy();
    }

    private boolean hasValidatedInternet() {
        if (connectivityManager == null) return true;

        Network activeNetwork = connectivityManager.getActiveNetwork();
        if (activeNetwork == null) return false;

        NetworkCapabilities capabilities =
            connectivityManager.getNetworkCapabilities(activeNetwork);
        return (
            capabilities != null &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        );
    }

    private void registerNetworkCallback() {
        if (connectivityManager == null || networkCallbackRegistered) return;

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                restoreOnlineIfShowingOffline();
            }

            @Override
            public void onCapabilitiesChanged(
                Network network,
                NetworkCapabilities networkCapabilities
            ) {
                if (
                    networkCapabilities.hasCapability(
                        NetworkCapabilities.NET_CAPABILITY_INTERNET
                    ) &&
                    networkCapabilities.hasCapability(
                        NetworkCapabilities.NET_CAPABILITY_VALIDATED
                    )
                ) {
                    restoreOnlineIfShowingOffline();
                }
            }
        };

        connectivityManager.registerDefaultNetworkCallback(networkCallback);
        networkCallbackRegistered = true;
    }

    private void showOfflineIfNeeded() {
        if (bridge == null || hasValidatedInternet()) return;

        String errorUrl = bridge.getErrorUrl();
        if (errorUrl == null || errorUrl.isEmpty()) return;

        bridge.getWebView().post(() -> {
            if (bridge == null || hasValidatedInternet()) return;

            String currentUrl = bridge.getWebView().getUrl();
            if (currentUrl == null || !currentUrl.startsWith(errorUrl)) {
                bridge.getWebView().loadUrl(errorUrl);
            }
        });
    }

    private void restoreOnlineIfShowingOffline() {
        if (bridge == null || !hasValidatedInternet()) return;

        String errorUrl = bridge.getErrorUrl();
        String appUrl = bridge.getAppUrl();
        if (errorUrl == null || appUrl == null) return;

        bridge.getWebView().post(() -> {
            if (bridge == null || !hasValidatedInternet()) return;

            String currentUrl = bridge.getWebView().getUrl();
            if (currentUrl == null || currentUrl.startsWith(errorUrl)) {
                bridge.getWebView().loadUrl(appUrl);
            }
        });
    }
}
