package com.youshi.cultivation;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

/** Only the record editor calls this picker; WebView file inputs elsewhere remain unchanged. */
@CapacitorPlugin(name = "RecordGallery")
public final class RecordGalleryPlugin extends Plugin {
    private static final int MAX_PHOTOS = 10;
    private static final int MAX_PHOTO_BYTES = 50 * 1024 * 1024;
    private final ArrayList<Uri> selectedUris = new ArrayList<>();
    private boolean picking;

    @PluginMethod
    public void pick(PluginCall call) {
        if (picking) {
            call.reject("gallery_busy");
            return;
        }
        selectedUris.clear();
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        boolean preferHuawei = "HUAWEI".equalsIgnoreCase(android.os.Build.MANUFACTURER);
        Intent preferred = preferHuawei ? new Intent(intent).setPackage("com.huawei.photos") : intent;
        try {
            picking = true;
            startActivityForResult(call, preferred, "selected");
        } catch (RuntimeException error) {
            if (preferHuawei) {
                try {
                    startActivityForResult(call, intent, "selected");
                    return;
                } catch (RuntimeException fallbackError) {
                    // Neither gallery nor the standard Android picker is available.
                }
            }
            picking = false;
            call.reject("gallery_unavailable");
        }
    }

    @ActivityCallback
    public void selected(PluginCall call, ActivityResult result) {
        picking = false;
        selectedUris.clear();
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            JSObject canceled = new JSObject();
            canceled.put("status", "canceled");
            canceled.put("count", 0);
            call.resolve(canceled);
            return;
        }
        ClipData clips = data.getClipData();
        int total = clips != null ? clips.getItemCount() : (data.getData() == null ? 0 : 1);
        for (int i = 0; i < Math.min(total, MAX_PHOTOS); i++) {
            Uri uri = clips != null ? clips.getItemAt(i).getUri() : data.getData();
            if (uri != null && "content".equals(uri.getScheme())) selectedUris.add(uri);
        }
        JSObject response = new JSObject();
        response.put("status", selectedUris.isEmpty() ? "canceled" : "selected");
        response.put("count", selectedUris.size());
        response.put("truncated", total > MAX_PHOTOS);
        call.resolve(response);
    }

    @PluginMethod
    public void read(PluginCall call) {
        Integer index = call.getInt("index");
        if (index == null || index < 0 || index >= selectedUris.size()) {
            call.reject("invalid_selection");
            return;
        }
        Uri uri = selectedUris.get(index);
        try {
            String mime = getContext().getContentResolver().getType(uri);
            if (mime == null || !mime.startsWith("image/")) throw new IllegalArgumentException("unsupported_photo");
            String name = "record-photo-" + (index + 1) + ".jpg";
            try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    String value = cursor.getString(0);
                    if (value != null && !value.trim().isEmpty()) name = value.replaceAll("[/\\\\]", "_");
                }
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
                if (stream == null) throw new IllegalStateException("photo_unreadable");
                byte[] buffer = new byte[65536];
                int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (output.size() + count > MAX_PHOTO_BYTES) throw new IllegalArgumentException("photo_too_large");
                    output.write(buffer, 0, count);
                }
            }
            JSObject response = new JSObject();
            response.put("name", name);
            response.put("mime", mime);
            response.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("gallery_photo_unavailable");
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        selectedUris.clear();
        call.resolve();
    }
}