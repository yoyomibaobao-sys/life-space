package com.youshi.cultivation;

import android.content.pm.PackageInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "InstallHistory")
public final class InstallHistoryPlugin extends Plugin {
    @PluginMethod
    public void getInstallState(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("freshInstall", info.firstInstallTime > 0 && info.firstInstallTime == info.lastUpdateTime);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not determine install history.", error);
        }
    }
}
