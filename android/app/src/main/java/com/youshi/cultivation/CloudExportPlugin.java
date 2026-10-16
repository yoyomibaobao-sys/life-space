package com.youshi.cultivation;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
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
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipFile;
import org.json.JSONObject;

/** Downloads the existing web export into private temporary storage, then saves through Android's document picker. */
@CapacitorPlugin(name = "CloudExport")
public final class CloudExportPlugin extends Plugin {
    private static final long MAX_ESTIMATE = 8192L;
    private static final long MAX_EXPORT = 2L * 1024L * 1024L * 1024L;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private File awaitingSave;
    private long awaitingSize;
    private byte[] awaitingHash;
    private boolean saving;

    private static String origin(PluginCall call) throws Exception {
        String text = call.getString("origin");
        if (text == null) throw new IllegalArgumentException();
        URI uri = new URI(text);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null ||
            uri.getUserInfo() != null || uri.getFragment() != null || uri.getQuery() != null ||
            !(uri.getPath().isEmpty() || "/".equals(uri.getPath())) ||
            !text.equals(uri.getScheme() + "://" + uri.getRawAuthority())) {
            throw new IllegalArgumentException();
        }
        return text;
    }

    private static String expectedProject(PluginCall call) throws Exception {
        String text = call.getString("supabaseUrl");
        if (text == null) throw new IllegalArgumentException();
        URI uri = new URI(text);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null ||
            uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null ||
            !text.equals(uri.getScheme() + "://" + uri.getRawAuthority())) {
            throw new IllegalArgumentException();
        }
        return text;
    }

    private static HttpURLConnection request(String url, String token, String zone) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(120000);
        connection.setRequestProperty("Accept", token == null ? "application/json" : "*/*");
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (zone != null) connection.setRequestProperty("X-Client-Timezone", zone);
        return connection;
    }

    private static byte[] readLimited(InputStream stream, long limit) throws Exception {
        java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        long count = 0;
        int size;
        while ((size = stream.read(chunk)) != -1) {
            count += size;
            if (count > limit) throw new IllegalStateException("export_too_large");
            buffer.write(chunk, 0, size);
        }
        return buffer.toByteArray();
    }

    private static void verifyEnvironment(String base, String expected) throws Exception {
        HttpURLConnection connection = request(base + "/api/export/my-records?environment=1", null, null);
        try {
            if (connection.getResponseCode() != 200) throw new IllegalStateException("export_environment_unavailable");
            String type = connection.getContentType();
            if (type == null || !type.toLowerCase(Locale.ROOT).contains("application/json"))
                throw new IllegalStateException("export_environment_invalid");
            JSONObject response = new JSONObject(new String(readLimited(connection.getInputStream(), 1024), java.nio.charset.StandardCharsets.UTF_8));
            if (!expected.equals(response.optString("supabaseUrl")))
                throw new IllegalStateException("export_environment_mismatch");
        } finally {
            connection.disconnect();
        }
    }

    private static String requireToken(PluginCall call) {
        String value = call.getString("accessToken");
        if (value == null || value.isEmpty() || value.contains("\n") || value.contains("\r")) throw new IllegalArgumentException();
        return value;
    }

    private static String zone(PluginCall call) {
        String value = call.getString("timeZone");
        return value != null && value.length() < 100 ? value : "UTC";
    }

    @PluginMethod
    public void estimate(PluginCall call) {
        worker.execute(() -> {
            try {
                String base = origin(call);
                String expected = expectedProject(call);
                String token = requireToken(call);
                verifyEnvironment(base, expected); // No bearer token leaves the device before this check.
                HttpURLConnection connection = request(base + "/api/export/my-records?estimate=1", token, zone(call));
                try {
                    if (connection.getResponseCode() != 200) throw new IllegalStateException("cloud_export_estimate_failed");
                    String type = connection.getContentType();
                    if (type == null || !type.toLowerCase(Locale.ROOT).contains("application/json"))
                        throw new IllegalStateException("cloud_export_estimate_invalid");
                    JSONObject data = new JSONObject(new String(readLimited(connection.getInputStream(), MAX_ESTIMATE), java.nio.charset.StandardCharsets.UTF_8));
                    JSObject result = new JSObject();
                    for (String field : new String[] { "projects", "cycles", "records", "media", "sizeBytes" }) {
                        long number = data.getLong(field);
                        if (number < 0) throw new IllegalStateException("cloud_export_estimate_invalid");
                        result.put(field, number);
                    }
                    call.resolve(result);
                } finally {
                    connection.disconnect();
                }
            } catch (Exception error) {
                call.reject("Could not verify or estimate cloud export."); // Never include token or URL in errors.
            }
        });
    }

    @PluginMethod
    public void save(PluginCall call) {
        synchronized (this) {
            if (saving) { call.reject("An export is already in progress."); return; }
            saving = true;
        }
        worker.execute(() -> {
            File file = null;
            try {
                String base = origin(call);
                String expected = expectedProject(call);
                String token = requireToken(call);
                verifyEnvironment(base, expected);
                HttpURLConnection connection = request(base + "/api/export/my-records", token, zone(call));
                try {
                    if (connection.getResponseCode() != 200) throw new IllegalStateException("cloud_export_download_failed");
                    String type = connection.getContentType();
                    if (type == null || !type.toLowerCase(Locale.ROOT).contains("application/zip"))
                        throw new IllegalStateException("cloud_export_download_invalid");
                    long length = connection.getContentLengthLong();
                    if (length > MAX_EXPORT) throw new IllegalStateException("cloud_export_too_large");
                    file = File.createTempFile("cloud-export-", ".zip", getContext().getCacheDir());
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");
                    long total = 0;
                    try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(file)) {
                        byte[] bytes = new byte[65536];
                        int count;
                        while ((count = input.read(bytes)) != -1) {
                            total += count;
                            if (total > MAX_EXPORT) throw new IllegalStateException("cloud_export_too_large");
                            output.write(bytes, 0, count);
                            digest.update(bytes, 0, count);
                        }
                        output.getFD().sync();
                    }
                    if (length >= 0 && length != total) throw new IllegalStateException("cloud_export_incomplete");
                    if (total < 4) throw new IllegalStateException("cloud_export_invalid_zip");
                    try (FileInputStream input = new FileInputStream(file)) {
                        if (input.read() != 0x50 || input.read() != 0x4b || input.read() != 0x03 || input.read() != 0x04)
                            throw new IllegalStateException("cloud_export_invalid_zip");
                    }
                    // The web exporter marks unavailable original media inside the ZIP.
                    // Do not tell Android users that an incomplete media backup succeeded.
                    try (ZipFile zip = new ZipFile(file)) {
                        if (zip.getEntry("data.json") == null || zip.getEntry("index.html") == null ||
                            zip.getEntry("未能下载的图片清单.txt") != null)
                            throw new IllegalStateException("cloud_export_missing_media");
                    }
                    synchronized (this) {
                        awaitingSave = file;
                        awaitingSize = total;
                        awaitingHash = digest.digest();
                    }
                    String name = "LifeSpace-cloud-" + new java.text.SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new java.util.Date()) + ".zip";
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.setType("application/zip");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.putExtra(Intent.EXTRA_TITLE, name);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    getActivity().runOnUiThread(() -> startActivityForResult(call, intent, "documentSelected"));
                    file = null;
                } finally {
                    connection.disconnect();
                }
            } catch (Exception error) {
                synchronized (this) { saving = false; }
                call.reject("Cloud export failed; no cloud or local project data was changed.");
            } finally {
                if (file != null) file.delete();
            }
        });
    }

    @ActivityCallback
    public void documentSelected(PluginCall call, ActivityResult result) {
        File file;
        long length;
        byte[] hash;
        synchronized (this) {
            file = awaitingSave;
            length = awaitingSize;
            hash = awaitingHash;
            awaitingSave = null;
            awaitingHash = null;
        }
        if (file == null || call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            file.delete();
            synchronized (this) { saving = false; }
            if (call != null) { JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); }
            return;
        }
        Uri target = data.getData();
        worker.execute(() -> {
            try {
                try (FileInputStream input = new FileInputStream(file);
                     OutputStream output = getContext().getContentResolver().openOutputStream(target, "w")) {
                    if (output == null) throw new IllegalStateException();
                    byte[] bytes = new byte[65536];
                    int count;
                    while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count);
                    output.flush();
                }
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long total = 0;
                try (InputStream input = getContext().getContentResolver().openInputStream(target)) {
                    if (input == null) throw new IllegalStateException();
                    byte[] bytes = new byte[65536];
                    int count;
                    while ((count = input.read(bytes)) != -1) { total += count; digest.update(bytes, 0, count); }
                }
                if (total != length || !MessageDigest.isEqual(digest.digest(), hash)) throw new IllegalStateException();
                JSObject response = new JSObject();
                response.put("cancelled", false);
                response.put("sizeBytes", total);
                StringBuilder hex = new StringBuilder();
                for (byte value : hash) hex.append(String.format(Locale.ROOT, "%02x", value & 0xff));
                response.put("sha256", hex.toString());
                call.resolve(response);
            } catch (Exception error) {
                // Do not touch the SAF LifeSpace tree or blindly delete a provider's target document.
                call.reject("The ZIP could not be saved and verified. Check the selected location and available space.");
            } finally {
                file.delete();
                synchronized (this) { saving = false; }
            }
        });
    }
}
