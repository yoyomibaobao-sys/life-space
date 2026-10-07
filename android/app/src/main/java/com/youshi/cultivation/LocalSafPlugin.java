package com.youshi.cultivation;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** SAF access is confined to the user's chosen tree and immutable LifeSpace files. */
@CapacitorPlugin(name = "LocalSaf")
public final class LocalSafPlugin extends Plugin {
    private static final String PREFS = "life-space-saf";
    private static final String KEY = "tree";
    private static final int CHUNK = 128 * 1024;
    private static final int MAX_BATCH_FILES = 16;
    private static final int MAX_BATCH_BYTES = 512 * 1024;
    private static final long MAX_FILE = 64L * 1024L * 1024L;
    private File pending;
    private String pendingPath;
    private String pendingHash;
    private long pendingSize;
    private long pendingWritten;
    private Uri candidateTree;

    @PluginMethod
    public void chooseDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "directorySelected");
    }

    @ActivityCallback
    public void directorySelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("No LifeSpace data directory was selected.");
            return;
        }
        Uri uri = data.getData();
        try {
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (flags != (Intent.FLAG_GRANT_READ_URI_PERMISSION |
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION)) {
                throw new IllegalStateException("The directory needs read and write access.");
            }
            getContext().getContentResolver().takePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            // Candidate access is persisted, but connection is not accepted until TS validates it.
            candidateTree = uri;
            JSObject response = new JSObject();
            response.put("uri", uri.toString());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not retain access to the chosen data directory.", error);
        }
    }

    @PluginMethod
    public void confirmDirectory(PluginCall call) {
        if (candidateTree == null) {
            call.reject("No LifeSpace candidate directory is awaiting validation.");
            return;
        }
        try {
            Uri accepted = requiredTree();
            getContext().getSharedPreferences(PREFS, 0).edit().putString(KEY, accepted.toString()).apply();
            candidateTree = null;
            call.resolve();
        } catch (Exception error) { call.reject("The candidate directory is unavailable.", error); }
    }

    @PluginMethod
    public void discardDirectory(PluginCall call) {
        candidateTree = null;
        call.resolve();
    }

    @PluginMethod
    public void directoryStatus(PluginCall call) {
        JSObject response = new JSObject();
        String saved = getContext().getSharedPreferences(PREFS, 0).getString(KEY, null);
        response.put("uri", saved);
        try {
            Uri uri = saved == null ? null : Uri.parse(saved);
            boolean persisted = false;
            for (UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (uri != null && uri.equals(permission.getUri()) && permission.isReadPermission() &&
                    permission.isWritePermission()) persisted = true;
            }
            response.put("available", persisted && DocumentsContract.Document.MIME_TYPE_DIR.equals(mime(
                DocumentsContract.buildDocumentUriUsingTree(uri,
                    DocumentsContract.getTreeDocumentId(uri)))));
        } catch (Exception error) {
            response.put("available", false);
        }
        call.resolve(response);
    }

    private Uri tree() {
        String saved = candidateTree != null ? candidateTree.toString() :
            getContext().getSharedPreferences(PREFS, 0).getString(KEY, null);
        if (saved == null) return null;
        Uri uri = Uri.parse(saved);
        for (UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (uri.equals(permission.getUri()) && permission.isReadPermission() &&
                permission.isWritePermission()) return uri;
        }
        return null;
    }

    private Uri requiredTree() {
        Uri uri = tree();
        if (uri == null) throw new IllegalStateException("Reconnect the LifeSpace data directory.");
        return uri;
    }

    private boolean safeFile(String path) {
        return path != null && (path.equals("identity.json") || path.equals("manifest.json") ||
            path.matches("commits/[0-9]{12}-[a-fA-F0-9-]{36}\\.json") ||
            path.matches("snapshots/[a-fA-F0-9-]{36}\\.json") ||
            path.matches("migration/[a-f0-9]{64}\\.json") ||
            path.matches("(local|cloud/[a-f0-9]{64}/(cache|pending))/projects/[A-Za-z0-9_-]{1,180}/[a-fA-F0-9-]{36}\\.json") ||
            path.matches("(local|cloud/[a-f0-9]{64}/(cache|pending))/media/[A-Za-z0-9_-]{1,180}/[a-f0-9]{64}\\.bin"));
    }

    // Capacitor's getLong accepts only boxed Long; small JSON integers arrive as Integer.
    private Long nonnegativeInteger(PluginCall call, String name) {
        Object value = call.getData().opt(name);
        if (!(value instanceof Integer) && !(value instanceof Long)) return null;
        long number = ((Number) value).longValue();
        return number >= 0 ? number : null;
    }

    private boolean safeDirectory(String path) {
        return path != null && (path.isEmpty() || path.equals("commits") ||
            path.equals("snapshots") || path.equals("local") ||
            path.matches("cloud(/[a-f0-9]{64}(/(cache|pending))?)?"));
    }

    @PluginMethod
    public void createDirectory(PluginCall call) {
        String path = call.getString("path");
        if (!safeDirectory(path) || path.isEmpty()) {
            call.reject("Invalid LifeSpace directory path."); return;
        }
        try {
            Uri tree = requiredTree();
            Uri dir = directory(tree, (path + "/_entry_").split("/"), true);
            if (!DocumentsContract.Document.MIME_TYPE_DIR.equals(mime(dir))) {
                throw new IllegalStateException("Cannot create LifeSpace directory.");
            }
            call.resolve();
        } catch (Exception error) { call.reject("Cannot create LifeSpace directory.", error); }
    }

    private Uri child(Uri tree, Uri directory, String name) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree,
            DocumentsContract.getDocumentId(directory));
        try (Cursor rows = resolver.query(children, new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        }, null, null, null)) {
            if (rows == null) throw new IllegalStateException("Directory cannot be read.");
            while (rows.moveToNext()) {
                if (name.equals(rows.getString(1))) {
                    return DocumentsContract.buildDocumentUriUsingTree(tree, rows.getString(0));
                }
            }
        }
        return null;
    }

    private Uri directory(Uri tree, String[] parts, boolean create) throws Exception {
        Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree,
            DocumentsContract.getTreeDocumentId(tree));
        for (int index = 0; index < parts.length - 1; index++) {
            Uri next = child(tree, dir, parts[index]);
            if (next == null && create) {
                next = DocumentsContract.createDocument(getContext().getContentResolver(), dir,
                    DocumentsContract.Document.MIME_TYPE_DIR, parts[index]);
            }
            if (next == null || !DocumentsContract.Document.MIME_TYPE_DIR.equals(mime(next))) {
                throw new IllegalStateException("The LifeSpace directory is unavailable or conflicts with a file.");
            }
            dir = next;
        }
        return dir;
    }

    private Uri existingDirectory(Uri tree, String[] parts) throws Exception {
        Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree,
            DocumentsContract.getTreeDocumentId(tree));
        for (int index = 0; index < parts.length - 1; index++) {
            Uri next = child(tree, dir, parts[index]);
            if (next == null) return null;
            if (!DocumentsContract.Document.MIME_TYPE_DIR.equals(mime(next))) {
                throw new IllegalStateException("LifeSpace directory conflicts with a file.");
            }
            dir = next;
        }
        return dir;
    }

    private String mime(Uri uri) throws Exception {
        try (Cursor row = getContext().getContentResolver().query(uri,
            new String[] { DocumentsContract.Document.COLUMN_MIME_TYPE }, null, null, null)) {
            if (row == null || !row.moveToFirst()) throw new IllegalStateException("Cannot read document metadata.");
            return row.getString(0);
        }
    }

    @PluginMethod
    public void listRoot(PluginCall call) {
        try {
            Uri tree = requiredTree();
            Uri root = DocumentsContract.buildDocumentUriUsingTree(tree,
                DocumentsContract.getTreeDocumentId(tree));
            Uri entries = DocumentsContract.buildChildDocumentsUriUsingTree(tree,
                DocumentsContract.getDocumentId(root));
            JSArray names = new JSArray();
            try (Cursor rows = getContext().getContentResolver().query(entries,
                new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                if (rows == null) throw new IllegalStateException("Cannot list the LifeSpace directory.");
                while (rows.moveToNext()) names.put(rows.getString(0));
            }
            JSObject response = new JSObject();
            response.put("names", names);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not inspect the LifeSpace directory.", error);
        }
    }

    @PluginMethod
    public void listDirectory(PluginCall call) {
        String path = call.getString("path", "");
        if (!safeDirectory(path)) { call.reject("Invalid LifeSpace directory path."); return; }
        try {
            Uri tree = requiredTree();
            String[] parts = path.isEmpty() ? new String[] { "_root_" } :
                (path + "/_entries_").split("/");
            Uri dir = path.isEmpty() ? DocumentsContract.buildDocumentUriUsingTree(tree,
                DocumentsContract.getTreeDocumentId(tree)) : existingDirectory(tree, parts);
            JSArray names = new JSArray();
            if (dir != null) {
                Uri entries = DocumentsContract.buildChildDocumentsUriUsingTree(tree,
                    DocumentsContract.getDocumentId(dir));
                try (Cursor rows = getContext().getContentResolver().query(entries,
                    new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                    if (rows == null) throw new IllegalStateException("Cannot list SAF directory.");
                    while (rows.moveToNext()) names.put(rows.getString(0));
                }
            }
            JSObject response = new JSObject(); response.put("names", names); call.resolve(response);
        } catch (Exception error) { call.reject("Cannot list LifeSpace directory.", error); }
    }

    @PluginMethod
    public void fileMetadata(PluginCall call) {
        String path = call.getString("path");
        if (!safeFile(path)) { call.reject("Invalid LifeSpace file path."); return; }
        try {
            Uri tree = requiredTree(); String[] parts = path.split("/");
            Uri dir = existingDirectory(tree, parts);
            Uri file = dir == null ? null : child(tree, dir, parts[parts.length - 1]);
            JSObject response = new JSObject(); response.put("exists", file != null);
            if (file != null) {
                try (Cursor row = getContext().getContentResolver().query(file,
                    new String[] { DocumentsContract.Document.COLUMN_SIZE,
                        DocumentsContract.Document.COLUMN_MIME_TYPE }, null, null, null)) {
                    if (row == null || !row.moveToFirst()) throw new IllegalStateException("No file metadata.");
                    response.put("size", row.getLong(0)); response.put("mimeType", row.getString(1));
                }
            }
            call.resolve(response);
        } catch (Exception error) { call.reject("Cannot inspect LifeSpace file.", error); }
    }

    /** Checkpoint is advisory. Immutable commit markers remain the authority after a crash. */
    @PluginMethod
    public synchronized void writeCheckpoint(PluginCall call) {
        String base64 = call.getString("base64", "");
        String expected = call.getString("sha256", "");
        if (!expected.matches("[a-f0-9]{64}") || base64.length() > 16384) {
            call.reject("Invalid LifeSpace checkpoint."); return;
        }
        Uri temporary = null;
        try {
            byte[] content = Base64.decode(base64, Base64.DEFAULT);
            MessageDigest checksum = MessageDigest.getInstance("SHA-256");
            checksum.update(content);
            StringBuilder hex = new StringBuilder();
            for (byte value : checksum.digest()) hex.append(String.format(Locale.US, "%02x", value & 0xff));
            if (!expected.equals(hex.toString())) throw new IllegalStateException("Checkpoint hash mismatch.");
            Uri tree = requiredTree();
            Uri root = DocumentsContract.buildDocumentUriUsingTree(tree,
                DocumentsContract.getTreeDocumentId(tree));
            // Read-only recovery uses markers. A later explicit write may repair a
            // checkpoint interrupted after the old root was renamed to backup.
            Uri interruptedBackup = child(tree, root, "manifest.backup.json");
            if (interruptedBackup != null) {
                if (child(tree, root, "manifest.json") == null) {
                    Uri restored = DocumentsContract.renameDocument(getContext().getContentResolver(),
                        interruptedBackup, "manifest.json");
                    if (restored == null) throw new IllegalStateException("Cannot restore checkpoint backup.");
                } else {
                    DocumentsContract.deleteDocument(getContext().getContentResolver(), interruptedBackup);
                }
            }
            temporary = DocumentsContract.createDocument(getContext().getContentResolver(), root,
                "application/json", "lifespace-checkpoint-" + java.util.UUID.randomUUID() + ".tmp");
            if (temporary == null) throw new IllegalStateException("Cannot stage checkpoint.");
            try (OutputStream out = getContext().getContentResolver().openOutputStream(temporary, "w")) {
                if (out == null) throw new IllegalStateException("Cannot write checkpoint.");
                out.write(content); out.flush();
            }
            if (!expected.equals(sha256(temporary))) throw new IllegalStateException("Checkpoint readback mismatch.");
            Uri previous = child(tree, root, "manifest.json");
            if (previous != null) {
                Uri backup = DocumentsContract.renameDocument(getContext().getContentResolver(),
                    previous, "manifest.backup.json");
                if (backup == null) throw new IllegalStateException("Cannot preserve previous checkpoint.");
            }
            Uri committed = DocumentsContract.renameDocument(getContext().getContentResolver(),
                temporary, "manifest.json");
            if (committed == null) throw new IllegalStateException("Cannot install checkpoint.");
            temporary = null;
            if (!expected.equals(sha256(committed))) throw new IllegalStateException("Checkpoint verification failed.");
            Uri backup = child(tree, root, "manifest.backup.json");
            if (backup != null) DocumentsContract.deleteDocument(getContext().getContentResolver(), backup);
            call.resolve();
        } catch (Exception error) {
            if (temporary != null) {
                try { DocumentsContract.deleteDocument(getContext().getContentResolver(), temporary); }
                catch (Exception ignored) { /* The immutable commit remains readable. */ }
            }
            call.reject("Cannot update LifeSpace checkpoint; commit chain retained.", error);
        }
    }

    @PluginMethod
    public void listManifests(PluginCall call) {
        try {
            Uri tree = requiredTree();
            Uri root = DocumentsContract.buildDocumentUriUsingTree(tree,
                DocumentsContract.getTreeDocumentId(tree));
            Uri manifests = child(tree, root, "manifests");
            JSArray names = new JSArray();
            if (manifests != null) {
                if (!DocumentsContract.Document.MIME_TYPE_DIR.equals(mime(manifests))) {
                    throw new IllegalStateException("Manifest directory conflicts with a file.");
                }
                Uri entries = DocumentsContract.buildChildDocumentsUriUsingTree(tree,
                    DocumentsContract.getDocumentId(manifests));
                try (Cursor rows = getContext().getContentResolver().query(entries,
                    new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                    if (rows == null) throw new IllegalStateException("Cannot list manifests.");
                    while (rows.moveToNext()) {
                        String name = rows.getString(0);
                        if (safeFile("manifests/" + name)) names.put(name);
                    }
                }
            }
            JSObject response = new JSObject();
            response.put("names", names);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not read the LifeSpace manifest list.", error);
        }
    }

    @PluginMethod
    public void readChunk(PluginCall call) {
        String path = call.getString("path");
        Long offset = nonnegativeInteger(call, "offset");
        if (!safeFile(path) || offset == null || offset < 0) {
            call.reject("Invalid LifeSpace file path or offset.");
            return;
        }
        try {
            Uri tree = requiredTree();
            String[] parts = path.split("/");
            Uri dir = existingDirectory(tree, parts);
            Uri file = dir == null ? null : child(tree, dir, parts[parts.length - 1]);
            if (file == null) {
                JSObject missing = new JSObject();
                missing.put("exists", false);
                missing.put("base64", "");
                missing.put("done", true);
                call.resolve(missing);
                return;
            }
            byte[] buffer = new byte[CHUNK];
            int length;
            try (InputStream stream = getContext().getContentResolver().openInputStream(file)) {
                if (stream == null) throw new IllegalStateException("The file cannot be opened.");
                long skipped = 0;
                while (skipped < offset) {
                    long advance = stream.skip(offset - skipped);
                    if (advance <= 0) {
                        if (stream.read() < 0) break;
                        advance = 1;
                    }
                    skipped += advance;
                }
                length = -1;
                if (skipped == offset) {
                    int total = 0;
                    while (total < buffer.length) {
                        int count = stream.read(buffer, total, buffer.length - total);
                        if (count < 0) break;
                        if (count == 0) continue;
                        total += count;
                    }
                    if (total > 0) length = total;
                }
            }
            JSObject response = new JSObject();
            response.put("exists", true);
            response.put("base64", length < 0 ? "" : Base64.encodeToString(buffer, 0, length, Base64.NO_WRAP));
            response.put("done", length < CHUNK);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not read the LifeSpace file.", error);
        }
    }

    /** Bounded transport only. TypeScript still verifies every marker, snapshot and project hash. */
    @PluginMethod
    public void readFiles(PluginCall call) {
        JSArray paths = call.getArray("paths");
        if (paths == null || paths.length() < 1 || paths.length() > MAX_BATCH_FILES) {
            call.reject("Invalid LifeSpace batch size."); return;
        }
        try {
            Uri tree = requiredTree();
            ContentResolver resolver = getContext().getContentResolver();
            Set<String> seen = new HashSet<>();
            Map<String, Map<String, Uri>> directories = new HashMap<>();
            JSArray files = new JSArray();
            int total = 0;
            for (int index = 0; index < paths.length(); index++) {
                String path = paths.getString(index);
                if (!safeFile(path) || !seen.add(path)) {
                    call.reject("Invalid or duplicate LifeSpace batch path."); return;
                }
                int separator = path.lastIndexOf('/');
                String parent = separator < 0 ? "" : path.substring(0, separator);
                String name = path.substring(separator + 1);
                Map<String, Uri> children = directories.get(parent);
                if (children == null) {
                    children = new HashMap<>();
                    Uri dir = parent.isEmpty() ? DocumentsContract.buildDocumentUriUsingTree(tree,
                        DocumentsContract.getTreeDocumentId(tree)) : existingDirectory(tree, path.split("/"));
                    if (dir != null) {
                        Uri listing = DocumentsContract.buildChildDocumentsUriUsingTree(tree,
                            DocumentsContract.getDocumentId(dir));
                        try (Cursor rows = resolver.query(listing, new String[] {
                            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                        }, null, null, null)) {
                            if (rows == null) throw new IllegalStateException("Cannot list batch directory.");
                            while (rows.moveToNext()) {
                                children.put(rows.getString(1), DocumentsContract.buildDocumentUriUsingTree(
                                    tree, rows.getString(0)));
                            }
                        }
                    }
                    directories.put(parent, children);
                }
                JSObject file = new JSObject();
                file.put("path", path);
                Uri uri = children.get(name);
                file.put("exists", uri != null);
                if (uri == null) {
                    file.put("base64", "");
                } else {
                    ByteArrayOutputStream content = new ByteArrayOutputStream();
                    try (InputStream stream = resolver.openInputStream(uri)) {
                        if (stream == null) throw new IllegalStateException("Cannot open batch file.");
                        byte[] buffer = new byte[16 * 1024];
                        int count;
                        while ((count = stream.read(buffer)) != -1) {
                            if (total + content.size() + count > MAX_BATCH_BYTES) {
                                throw new IllegalArgumentException("SAF batch byte limit exceeded.");
                            }
                            content.write(buffer, 0, count);
                        }
                    }
                    total += content.size();
                    file.put("base64", Base64.encodeToString(content.toByteArray(), Base64.NO_WRAP));
                }
                files.put(file);
            }
            JSObject response = new JSObject(); response.put("files", files); call.resolve(response);
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), error);
        } catch (Exception error) {
            call.reject("Could not read the LifeSpace batch.", error);
        }
    }

    @PluginMethod
    public void hasFile(PluginCall call) {
        String path = call.getString("path");
        String hash = call.getString("sha256");
        if (!safeFile(path) || hash == null || !hash.matches("[a-f0-9]{64}")) {
            call.reject("Invalid LifeSpace file reference.");
            return;
        }
        try {
            Uri tree = requiredTree();
            String[] parts = path.split("/");
            Uri dir = existingDirectory(tree, parts);
            Uri file = dir == null ? null : child(tree, dir, parts[parts.length - 1]);
            if (file != null && !hash.equals(sha256(file))) {
                throw new IllegalStateException("An existing LifeSpace file has different content.");
            }
            JSObject response = new JSObject();
            response.put("exists", file != null);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not verify the LifeSpace file.", error);
        }
    }

    @PluginMethod
    public synchronized void beginWrite(PluginCall call) {
        String path = call.getString("path");
        String hash = call.getString("sha256");
        Long size = nonnegativeInteger(call, "size");
        if (!safeFile(path) || hash == null || !hash.matches("[a-f0-9]{64}") ||
            size == null || size < 0 || size > MAX_FILE || pending != null) {
            call.reject("Invalid or concurrent LifeSpace file write.");
            return;
        }
        try {
            requiredTree();
            pending = File.createTempFile("life-space-saf-", ".part", getContext().getCacheDir());
            pendingPath = path;
            pendingHash = hash;
            pendingSize = size;
            pendingWritten = 0;
            call.resolve();
        } catch (Exception error) {
            clearPending();
            call.reject("Could not prepare the LifeSpace file.", error);
        }
    }

    @PluginMethod
    public synchronized void appendChunk(PluginCall call) {
        if (pending == null) {
            call.reject("No LifeSpace write is in progress.");
            return;
        }
        try {
            byte[] bytes = Base64.decode(call.getString("base64", ""), Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > CHUNK || pendingWritten + bytes.length > pendingSize) {
                throw new IllegalArgumentException("Invalid LifeSpace write chunk.");
            }
            try (OutputStream out = new FileOutputStream(pending, true)) { out.write(bytes); }
            pendingWritten += bytes.length;
            call.resolve();
        } catch (Exception error) {
            clearPending();
            call.reject("Could not write the LifeSpace file chunk.", error);
        }
    }

    @PluginMethod
    public synchronized void finishWrite(PluginCall call) {
        if (pending == null) {
            call.reject("No LifeSpace write is in progress.");
            return;
        }
        Uri created = null;
        try {
            if (pendingWritten != pendingSize || !pendingHash.equals(sha256(pending))) {
                throw new IllegalStateException("LifeSpace file hash or size mismatch.");
            }
            Uri tree = requiredTree();
            String[] parts = pendingPath.split("/");
            Uri dir = directory(tree, parts, true);
            String name = parts[parts.length - 1];
            Uri existing = child(tree, dir, name);
            if (existing != null) {
                if (!pendingHash.equals(sha256(existing))) {
                    throw new IllegalStateException("An existing LifeSpace file has different content.");
                }
            } else {
                // Never expose a partially written final document to a later restore.
                String stagingName = "lifespace-staging-" + java.util.UUID.randomUUID() + ".tmp";
                created = DocumentsContract.createDocument(getContext().getContentResolver(), dir,
                    "application/octet-stream", stagingName);
                if (created == null) throw new IllegalStateException("Could not create the LifeSpace file.");
                try (InputStream in = new FileInputStream(pending);
                     OutputStream out = getContext().getContentResolver().openOutputStream(created, "w")) {
                    if (out == null) throw new IllegalStateException("Could not open the LifeSpace file for writing.");
                    byte[] buffer = new byte[CHUNK];
                    int count;
                    while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                    out.flush();
                }
                if (!pendingHash.equals(sha256(created))) {
                    throw new IllegalStateException("LifeSpace file verification failed.");
                }
                // A concurrent writer must not replace an existing document with this name.
                if (child(tree, dir, name) != null) {
                    throw new IllegalStateException("LifeSpace file name was claimed during the write.");
                }
                Uri renamed = DocumentsContract.renameDocument(getContext().getContentResolver(),
                    created, name);
                if (renamed == null) throw new IllegalStateException("Document provider cannot commit LifeSpace files.");
                created = renamed;
                if (!name.equals(displayName(created)) || !pendingHash.equals(sha256(created))) {
                    throw new IllegalStateException("LifeSpace committed file verification failed.");
                }
            }
            clearPending();
            call.resolve();
        } catch (Exception error) {
            if (created != null) {
                try { DocumentsContract.deleteDocument(getContext().getContentResolver(), created); }
                catch (Exception ignored) { /* An uncommitted file cannot replace a manifest. */ }
            }
            clearPending();
            call.reject("LifeSpace file was not committed.", error);
        }
    }

    @PluginMethod
    public synchronized void cancelWrite(PluginCall call) {
        clearPending();
        call.resolve();
    }

    private void clearPending() {
        if (pending != null) pending.delete();
        pending = null;
        pendingPath = null;
        pendingHash = null;
        pendingSize = 0;
        pendingWritten = 0;
    }

    private String mimeForName(String name) {
        if (name.endsWith(".jpg")) return "image/jpeg";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".heic")) return "image/heic";
        if (name.endsWith(".mp4")) return "video/mp4";
        return "application/octet-stream";
    }

    private String displayName(Uri uri) throws Exception {
        try (Cursor row = getContext().getContentResolver().query(uri,
            new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (row == null || !row.moveToFirst()) throw new IllegalStateException("Cannot read document name.");
            return row.getString(0);
        }
    }

    private String sha256(Uri uri) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("Could not verify LifeSpace file.");
            return digest(in);
        }
    }

    private String sha256(File file) throws Exception {
        try (InputStream in = new FileInputStream(file)) { return digest(in); }
    }

    private String digest(InputStream in) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        byte[] bytes = new byte[CHUNK];
        int count;
        while ((count = in.read(bytes)) != -1) hash.update(bytes, 0, count);
        StringBuilder result = new StringBuilder();
        for (byte value : hash.digest()) result.append(String.format(Locale.US, "%02x", value & 0xff));
        return result.toString();
    }
}
