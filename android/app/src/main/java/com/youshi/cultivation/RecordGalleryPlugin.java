package com.youshi.cultivation;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;
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
    private String selectedRequestId;

    @PluginMethod
    public void pick(PluginCall call) {
        if (picking) {
            call.reject("gallery_busy");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        // A nonce is supplied only by the cloud composer for its one-shot
        // interruption recovery. Legacy callers keep the same picker.
        String requestId = call.getString("requestId");
        if (requestId != null && !requestId.matches("(?i)[0-9a-f-]{36}")) {
            call.reject("gallery_invalid_request");
            return;
        }
        selectedUris.clear();
        selectedRequestId = null;
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        // Use the Android resolver contract, not a Huawei-only Activity.
        // Vendor galleries may return different URI/result formats on Android 10.
        try {
            picking = true;
            startActivityForResult(call, intent, "selected");
        } catch (RuntimeException error) {
            picking = false;
            call.reject("gallery_unavailable");
        }
    }

    @ActivityCallback
    public void selected(PluginCall call, ActivityResult result) {
        picking = false;
        selectedUris.clear();
        selectedRequestId = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject canceled = new JSObject();
            canceled.put("status", "canceled");
            canceled.put("count", 0);
            String requestId = call.getString("requestId");
            if (requestId != null) canceled.put("requestId", requestId);
            call.resolve(canceled);
            return;
        }

        Intent data = result.getData();
        if (data == null) {
            // RESULT_OK without a readable result must not masquerade as a
            // user cancel: the form otherwise silently stays at zero photos.
            call.reject("gallery_result_empty");
            return;
        }
        ClipData clips = data.getClipData();
        int total = clips != null ? clips.getItemCount() : 0;
        if (clips != null) {
            for (int i = 0; i < clips.getItemCount(); i++) {
                addSelectedUri(clips.getItemAt(i).getUri());
            }
        }
        Uri single = data.getData();
        if (single != null) {
            total = Math.max(total, 1);
            addSelectedUri(single);
        }
        if (selectedUris.isEmpty()) {
            // Some Android 10 vendor galleries send an EXTRA_STREAM instead of
            // ClipData/data. This is only a returned read grant, not SAF access.
            try {
                ArrayList<Uri> streams = data.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (streams != null) {
                    total = Math.max(total, streams.size());
                    for (Uri uri : streams) addSelectedUri(uri);
                } else {
                    Uri stream = data.getParcelableExtra(Intent.EXTRA_STREAM);
                    if (stream != null) {
                        total = Math.max(total, 1);
                        addSelectedUri(stream);
                    }
                }
            } catch (RuntimeException invalidExtra) {
                // A malformed vendor extra must not be interpreted as cancel.
            }
        }
        if (selectedUris.isEmpty()) {
            call.reject("gallery_result_unreadable");
            return;
        }
        JSObject response = new JSObject();
        response.put("status", "selected");
        response.put("count", selectedUris.size());
        response.put("truncated", total > MAX_PHOTOS);
        String requestId = call.getString("requestId");
        selectedRequestId = requestId;
        if (requestId != null) response.put("requestId", requestId);
        call.resolve(response);
    }

    private void addSelectedUri(Uri uri) {
        if (uri == null || selectedUris.size() >= MAX_PHOTOS) return;
        String scheme = uri.getScheme();
        // ContentResolver supports both provider grants and file:// results.
        if (("content".equalsIgnoreCase(scheme) || "file".equalsIgnoreCase(scheme))
                && !selectedUris.contains(uri)) {
            selectedUris.add(uri);
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        Integer index = call.getInt("index");
        if (!matchesSelection(call) || index == null || index < 0 || index >= selectedUris.size()) {
            call.reject("invalid_selection");
            return;
        }
        Uri uri = selectedUris.get(index);
        try {
            String mime = null;
            try {
                mime = getContext().getContentResolver().getType(uri);
            } catch (RuntimeException metadataError) {
                // A metadata-only failure is not proof the image stream fails.
            }
            String name = "record-photo-" + (index + 1) + ".jpg";
            try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    String value = cursor.getString(0);
                    if (value != null && !value.trim().isEmpty()) name = value.replaceAll("[/\\\\]", "_");
                }
            } catch (RuntimeException metadataError) {
                // Some photo providers allow stream reads but reject metadata
                // queries. Keep reading the granted URI with a safe filename.
            }
            if (mime == null || !mime.startsWith("image/")) {
                String ext = MimeTypeMap.getFileExtensionFromUrl(name);
                String guessed = ext == null ? null
                    : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase(java.util.Locale.ROOT));
                if (guessed != null && guessed.startsWith("image/")) mime = guessed;
            }
            if (mime == null || !mime.startsWith("image/")) {
                throw new IllegalArgumentException("unsupported_photo");
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

    private boolean matchesSelection(PluginCall call) {
        return java.util.Objects.equals(selectedRequestId, call.getString("requestId"));
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (matchesSelection(call)) {
            selectedUris.clear();
            selectedRequestId = null;
        }
        call.resolve();
    }
}