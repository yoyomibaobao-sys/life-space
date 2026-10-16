package com.youshi.cultivation;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** User initiated export of already accessible image bytes; no media URL leaves the app. */
@CapacitorPlugin(name = "ImageActions")
public final class ImageActionsPlugin extends Plugin {
    private static final int MAX_BYTES = 25 * 1024 * 1024;
    private File pendingFile;
    private boolean busy;

    private static String mime(PluginCall call) {
        String value = call.getString("mimeType");
        if (!"image/jpeg".equals(value) && !"image/png".equals(value) &&
            !"image/webp".equals(value) && !"image/gif".equals(value)) {
            throw new IllegalArgumentException("unsupported_image");
        }
        return value;
    }

    private File prepare(PluginCall call) throws Exception {
        String type = mime(call);
        String name = call.getString("fileName");
        String data = call.getString("data");
        if (name == null || !name.matches("LifeSpace-[a-zA-Z0-9_-]{1,64}\\.(jpg|png|webp|gif)") ||
            data == null || data.length() > (MAX_BYTES * 4L / 3L + 8L)) {
            throw new IllegalArgumentException("invalid_image");
        }
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("invalid_image");
        String extension = type.equals("image/jpeg") ? "jpg" : type.substring("image/".length());
        if (!name.endsWith("." + extension)) throw new IllegalArgumentException("invalid_image");
        File folder = new File(getContext().getCacheDir(), "image-actions");
        if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("cache_unavailable");
        File file = new File(folder, name);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
            output.getFD().sync();
        }
        return file;
    }

    @PluginMethod
    public void save(PluginCall call) {
        synchronized (this) {
            if (busy) { call.reject("Another image action is in progress."); return; }
            busy = true;
        }
        try {
            pendingFile = prepare(call);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime(call));
            intent.putExtra(Intent.EXTRA_TITLE, pendingFile.getName());
            startActivityForResult(call, intent, "documentSelected");
        } catch (Exception error) {
            synchronized (this) { busy = false; pendingFile = null; }
            call.reject("Unable to prepare image for saving.");
        }
    }

    @ActivityCallback
    public void documentSelected(PluginCall call, ActivityResult result) {
        File file = pendingFile;
        pendingFile = null;
        synchronized (this) { busy = false; }
        if (file == null || call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            file.delete();
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        try (InputStream input = new FileInputStream(file);
             OutputStream output = getContext().getContentResolver().openOutputStream(data.getData(), "w")) {
            if (output == null) throw new IllegalStateException("save_unavailable");
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.flush();
            JSObject response = new JSObject();
            response.put("cancelled", false);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Image save failed.");
        } finally {
            file.delete();
        }
    }
}
