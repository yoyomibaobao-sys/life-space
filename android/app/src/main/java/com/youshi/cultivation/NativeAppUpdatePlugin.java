package com.youshi.cultivation;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Downloads only the official LifeSpace APK, verifies its bytes, package,
 * version and permanent signer, then hands it to Android's package installer.
 * Android remains responsible for the final user-confirmed update.
 */
@CapacitorPlugin(name = "NativeAppUpdate")
public final class NativeAppUpdatePlugin extends Plugin {

    private static final String OFFICIAL_UPDATE_URL =
        "https://life-space.uk/downloads/android/latest.apk";
    private static final String OFFICIAL_SIGNER_SHA256 =
        "ccc03e33fed7ce95dd4d203aa3451a08cdc175874e4a6ae159b81c367164635d";
    private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 30_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean updateInProgress = new AtomicBoolean(false);

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        JSObject result = new JSObject();
        result.put("versionName", BuildConfig.VERSION_NAME);
        result.put("versionCode", currentVersionCode());
        call.resolve(result);
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        String downloadUrl = call.getString("downloadUrl");
        String expectedSha256 = normalizeSha256(call.getString("sha256"));
        Long expectedSize = readPositiveLong(call, "sizeBytes");
        Long expectedVersionCode = readPositiveLong(call, "versionCode");

        if (!OFFICIAL_UPDATE_URL.equals(downloadUrl)) {
            call.reject("Only the official Android update URL is allowed.");
            return;
        }
        if (expectedSha256 == null || expectedSize == null || expectedVersionCode == null) {
            call.reject("Valid release verification data is required.");
            return;
        }
        if (expectedSize > MAX_APK_BYTES) {
            call.reject("The Android update is larger than the allowed limit.");
            return;
        }
        if (expectedVersionCode <= currentVersionCode()) {
            call.reject("The selected Android release is not newer than this app.");
            return;
        }
        if (!updateInProgress.compareAndSet(false, true)) {
            call.reject("An Android update is already being prepared.");
            return;
        }

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !getContext().getPackageManager().canRequestPackageInstalls()
        ) {
            updateInProgress.set(false);
            openInstallPermissionSettings(call);
            return;
        }

        updateExecutor.execute(() -> {
            File apkFile = null;
            try {
                apkFile = downloadVerifiedApk(
                    downloadUrl,
                    expectedSize,
                    expectedSha256
                );
                verifyArchive(apkFile, expectedVersionCode);
                File verifiedApk = apkFile;
                getBridge().executeOnMainThread(() -> openPackageInstaller(call, verifiedApk));
            } catch (Exception error) {
                if (apkFile != null) apkFile.delete();
                rejectOnMainThread(call, "The Android update could not be verified or opened.");
            } finally {
                updateInProgress.set(false);
            }
        });
    }

    private void openInstallPermissionSettings(PluginCall call) {
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("status", "permission_required");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Android could not open the install permission setting.");
        }
    }

    private File downloadVerifiedApk(
        String downloadUrl,
        long expectedSize,
        String expectedSha256
    ) throws Exception {
        File updateDirectory = new File(getContext().getCacheDir(), "updates");
        if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
            throw new IllegalStateException("Could not create the update directory.");
        }

        File apkFile = new File(updateDirectory, "youshi-cultivation-update.apk");
        if (apkFile.exists() && !apkFile.delete()) {
            throw new IllegalStateException("Could not replace the previous update file.");
        }

        HttpURLConnection connection = (HttpURLConnection) new URL(downloadUrl).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setRequestProperty("User-Agent", "LifeSpaceAndroidUpdater/1.0");

        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("The update server returned an unexpected response.");
            }
            long contentLength = connection.getContentLengthLong();
            if (contentLength > 0 && contentLength != expectedSize) {
                throw new IllegalStateException("The update size does not match its release data.");
            }

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long bytesWritten = 0;
            byte[] buffer = new byte[32 * 1024];

            try (
                InputStream input = connection.getInputStream();
                FileOutputStream output = new FileOutputStream(apkFile)
            ) {
                int count;
                while ((count = input.read(buffer)) != -1) {
                    bytesWritten += count;
                    if (bytesWritten > expectedSize || bytesWritten > MAX_APK_BYTES) {
                        throw new IllegalStateException("The update exceeded its expected size.");
                    }
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                }
                output.getFD().sync();
            }

            if (bytesWritten != expectedSize) {
                throw new IllegalStateException("The downloaded update is incomplete.");
            }
            if (!expectedSha256.equals(toHex(digest.digest()))) {
                throw new IllegalStateException("The update checksum does not match.");
            }
            return apkFile;
        } finally {
            connection.disconnect();
        }
    }

    @SuppressWarnings("deprecation")
    private void verifyArchive(File apkFile, long expectedVersionCode) throws Exception {
        PackageManager packageManager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo archive = packageManager.getPackageArchiveInfo(
            apkFile.getAbsolutePath(),
            flags
        );

        if (archive == null || !BuildConfig.APPLICATION_ID.equals(archive.packageName)) {
            throw new IllegalStateException("The update package identity is invalid.");
        }

        long archiveVersionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? archive.getLongVersionCode()
            : archive.versionCode;
        if (
            archiveVersionCode != expectedVersionCode ||
            archiveVersionCode <= currentVersionCode()
        ) {
            throw new IllegalStateException("The update version is invalid.");
        }

        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && archive.signingInfo != null) {
            signatures = archive.signingInfo.getApkContentsSigners();
        } else {
            signatures = archive.signatures;
        }
        if (signatures == null || signatures.length != 1) {
            throw new IllegalStateException("The update signer is invalid.");
        }

        MessageDigest signerDigest = MessageDigest.getInstance("SHA-256");
        String signerSha256 = toHex(signerDigest.digest(signatures[0].toByteArray()));
        if (!OFFICIAL_SIGNER_SHA256.equals(signerSha256)) {
            throw new IllegalStateException("The update signer does not match.");
        }
    }

    private void openPackageInstaller(PluginCall call, File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                BuildConfig.APPLICATION_ID + ".fileprovider",
                apkFile
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setClipData(ClipData.newRawUri("Android update", apkUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);

            JSObject result = new JSObject();
            result.put("status", "installer_opened");
            call.resolve(result);
        } catch (Exception error) {
            apkFile.delete();
            call.reject("Android could not open the package installer.");
        }
    }

    private void rejectOnMainThread(PluginCall call, String message) {
        getBridge().executeOnMainThread(() -> call.reject(message));
    }

    private static Long readPositiveLong(PluginCall call, String key) {
        Object value = call.getData().opt(key);
        if (!(value instanceof Number)) return null;
        long normalized = ((Number) value).longValue();
        return normalized > 0 ? normalized : null;
    }

    private static String normalizeSha256(String value) {
        if (value == null) return null;
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return normalized.matches("[a-f0-9]{64}") ? normalized : null;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value));
        return result.toString();
    }

    private static long currentVersionCode() {
        return BuildConfig.VERSION_CODE;
    }

    @Override
    protected void handleOnDestroy() {
        updateExecutor.shutdownNow();
    }
}
