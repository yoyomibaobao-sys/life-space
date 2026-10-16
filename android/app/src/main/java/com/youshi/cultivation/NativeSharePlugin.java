package com.youshi.cultivation;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** Opens the Android share sheet for a public experience-card link or a local MP4 copy. */
@CapacitorPlugin(name = "NativeShare")
public final class NativeSharePlugin extends Plugin {
    private static final int MAX_MP4_BYTES = 32 * 1024 * 1024;
    private static final int MAX_SHARE_COPIES = 3;

    @PluginMethod
    public void shareText(PluginCall call) {
        String title = safeTitle(call.getString("title"));
        String url = call.getString("url");
        if (!isPublicCardUrl(url)) {
            call.reject("invalid_share_link");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, title);
        send.putExtra(Intent.EXTRA_TEXT, title + "\n" + url);
        openChooser(call, send, title);
    }

    @PluginMethod
    public void shareMp4(PluginCall call) {
        try {
            File file = writeMp4(call.getString("fileName"), call.getString("data"));
            // The cache file is closed. Capacitor saves this same PluginCall from both
            // Plugin.saveInstanceState and Bridge.saveInstanceState, so the video bytes
            // must already be gone before the share activity starts.
            JSObject options = call.getData();
            if (options != null) options.remove("data");
            String title = safeTitle(call.getString("title"));
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("video/mp4");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.setClipData(ClipData.newRawUri(file.getName(), uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            PackageManager manager = getContext().getPackageManager();
            List<ResolveInfo> targets = manager.queryIntentActivities(send, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo info : targets) {
                getContext().grantUriPermission(
                    info.activityInfo.packageName,
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            }
            openChooser(call, send, title);
        } catch (Exception error) {
            call.reject("mp4_share_unavailable");
        }
    }

    @ActivityCallback
    public void shareFinished(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        response.put("status", result.getResultCode() == Activity.RESULT_OK ? "shared" : "canceled");
        call.resolve(response);
    }

    private void openChooser(PluginCall call, Intent send, String title) {
        if (getActivity() == null) {
            call.reject("share_unavailable");
            return;
        }
        try {
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, chooser, "shareFinished");
        } catch (RuntimeException error) {
            call.reject("share_unavailable");
        }
    }

    private File writeMp4(String requestedName, String data) throws Exception {
        if (data == null || data.length() > (MAX_MP4_BYTES * 4L / 3L + 8L)) {
            throw new IllegalArgumentException("invalid_mp4");
        }
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        if (bytes.length < 12 || bytes.length > MAX_MP4_BYTES ||
            bytes[4] != 'f' || bytes[5] != 't' || bytes[6] != 'y' || bytes[7] != 'p') {
            throw new IllegalArgumentException("invalid_mp4");
        }
        File folder = new File(getContext().getCacheDir(), "native-share");
        if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("cache_unavailable");
        trimOldCopies(folder);
        String safeName = safeMp4Name(requestedName);
        File file = new File(folder, safeName.substring(0, safeName.length() - 4) + "-" + System.currentTimeMillis() + ".mp4");
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
            output.getFD().sync();
        }
        return file;
    }

    private static void trimOldCopies(File folder) {
        File[] files = folder.listFiles();
        if (files == null || files.length < MAX_SHARE_COPIES) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (int index = 0; index <= files.length - MAX_SHARE_COPIES; index += 1) {
            files[index].delete();
        }
    }

    private static String safeTitle(String title) {
        if (title == null) return "分享";
        String cleaned = title.replaceAll("[\\p{Cntrl}]+", " ").trim();
        if (cleaned.isEmpty()) return "分享";
        return cleaned.length() > 120 ? cleaned.substring(0, 120) : cleaned;
    }

    private static String safeMp4Name(String name) {
        String base = name == null ? "" : name.replace('\\', '/').trim();
        int slash = base.lastIndexOf('/');
        if (slash >= 0) base = base.substring(slash + 1);
        if (base.length() > 80) base = base.substring(base.length() - 80);
        if (!base.toLowerCase(Locale.US).endsWith(".mp4") || base.contains("..") ||
            !base.matches("[\\p{L}\\p{N} ._-]+\\.mp4")) {
            return "experience-card.mp4";
        }
        return base;
    }

    private static boolean isPublicCardUrl(String url) {
        if (url == null || url.length() > 500) return false;
        Uri parsed = Uri.parse(url);
        if (!"https".equalsIgnoreCase(parsed.getScheme()) || parsed.getUserInfo() != null) return false;
        if (parsed.getQuery() != null || parsed.getFragment() != null) return false;
        String path = parsed.getPath();
        return path != null && path.matches("/experience-cards/[A-Za-z0-9_-]{1,80}");
    }
}
