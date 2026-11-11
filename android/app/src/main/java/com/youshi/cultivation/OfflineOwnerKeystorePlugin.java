package com.youshi.cultivation;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;

/** Only an authenticated /auth/v1/user GET can mint this device-local read proof.
 * No token, media, arbitrary signing, or cloud write API is exposed or persisted.
 */
@CapacitorPlugin(name = "OfflineOwnerKeystore")
public class OfflineOwnerKeystorePlugin extends Plugin {
    private static final String PREFS = "lifespace.offline-owner.v1";
    private static final String QA = "https://mablwxlipcgbmbnfdbkc.supabase.co";
    private static final String PROD = "https://eidltoikfpnrzxruvawf.supabase.co";
    private static final String QA_PACKAGE = "com.youshi.cultivation.w5freshqa20261103a";
    private static final String QA_R18_PACKAGE = "com.youshi.cultivation.w5qa20261109r18";
    private static final String PROD_PACKAGE = "com.youshi.cultivation";
    private static final String PROD_WEB = "https://life-space.uk";
    private static final String QA_WEB = "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev";
    private static final Object LOCK = new Object();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String environmentForPackage(String packageName) {
        if (QA_PACKAGE.equals(packageName) || QA_R18_PACKAGE.equals(packageName)) return QA;
        if (PROD_PACKAGE.equals(packageName)) return PROD;
        throw new SecurityException("OFFLINE_OWNER_UNSUPPORTED_INSTALL");
    }

    static String httpsOrigin(String value) {
        Uri u = Uri.parse(value == null ? "" : value);
        if (!"https".equals(u.getScheme()) || u.getHost() == null ||
            u.getUserInfo() != null || (u.getPort() != -1 && u.getPort() != 443)) {
            throw new SecurityException("OFFLINE_OWNER_ORIGIN_REJECTED");
        }
        return "https://" + u.getHost();
    }

    private String callerOrigin() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            throw new SecurityException("OFFLINE_OWNER_ORIGIN_REJECTED");
        }
        String current = httpsOrigin(getBridge().getWebView().getUrl());
        String server = getBridge().getConfig().getServerUrl();
        String configured = server == null
            ? httpsOrigin(getBridge().getConfig().getAndroidScheme() + "://" +
                getBridge().getConfig().getHostname())
            : httpsOrigin(server);
        String expected = PROD.equals(environmentForPackage(getContext().getPackageName()))
            ? PROD_WEB : QA_WEB;
        if (!current.equals(configured) || !current.equals(expected)) {
            throw new SecurityException("OFFLINE_OWNER_ORIGIN_REJECTED");
        }
        return current;
    }

    private String environment(PluginCall call) {
        String expected = environmentForPackage(getContext().getPackageName());
        if (!expected.equals(call.getString("environment"))) {
            throw new SecurityException("OFFLINE_OWNER_ENVIRONMENT_MISMATCH");
        }
        return expected;
    }

    private static String uuid(String value) {
        if (value == null || !value.matches(
                "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw new SecurityException("OFFLINE_OWNER_IDENTITY_MISMATCH");
        }
        return value;
    }

    private String installId(boolean create) {
        String id = prefs().getString("install", null);
        if (id == null && create) {
            id = UUID.randomUUID().toString();
            if (!prefs().edit().putString("install", id).commit()) {
                throw new SecurityException("OFFLINE_OWNER_STORAGE_FAILED");
            }
        }
        return id;
    }

    private String alias(String install, long generation) {
        return "lifespace.offline-owner.v1." + install + "." + generation;
    }

    private SecretKey key(String install, long generation, boolean create) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        String alias = alias(install, generation);
        if (!ks.containsAlias(alias) && create) {
            KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setKeySize(256)
                .build());
            generator.generateKey();
        }
        SecretKey key = (SecretKey) ks.getKey(alias, null);
        if (key == null) throw new SecurityException("OFFLINE_OWNER_KEY_MISSING");
        return key;
    }

    // Pure JCE helpers are also exercised by the isolated JVM negative tests.
    static byte[] encryptProof(SecretKey key, byte[] aad, byte[] plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key); // Provider generates a fresh IV.
        cipher.updateAAD(aad);
        byte[] encrypted = cipher.doFinal(plain), iv = cipher.getIV();
        if (iv.length != 12) throw new SecurityException("OFFLINE_OWNER_IV_REJECTED");
        byte[] framed = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, framed, 0, iv.length);
        System.arraycopy(encrypted, 0, framed, iv.length, encrypted.length);
        return framed;
    }

    static byte[] decryptProof(SecretKey key, byte[] aad, byte[] framed) throws Exception {
        if (framed.length < 29 || framed.length > 8192) {
            throw new SecurityException("OFFLINE_OWNER_PROOF_REJECTED");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key,
            new GCMParameterSpec(128, Arrays.copyOfRange(framed, 0, 12)));
        cipher.updateAAD(aad);
        return cipher.doFinal(Arrays.copyOfRange(framed, 12, framed.length));
    }

    private byte[] aad(String install, long generation, String env, String origin) {
        return ("v1\n" + getContext().getPackageName() + "\n" + install + "\n" +
            generation + "\n" + env + "\n" + origin).getBytes(StandardCharsets.UTF_8);
    }

    private void revokeLocked() throws Exception {
        String install = installId(false);
        long generation = prefs().getLong("generation", 0);
        // Persist the revocation before deleting the key: a failed delete must
        // still make a late network response or old proof unusable.
        if (!prefs().edit().remove("proof").putLong("generation", generation + 1).commit()) {
            throw new SecurityException("OFFLINE_OWNER_STORAGE_FAILED");
        }
        if (install != null) {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            ks.deleteEntry(alias(install, generation));
        }
    }

    private void revokeQuietly() {
        synchronized (LOCK) {
            try { revokeLocked(); } catch (Exception ignored) { /* JS remains locked. */ }
        }
    }

    private JSONObject claims(String token, String env, String owner, String session) throws Exception {
        if (token == null || token.length() > 16384) throw new SecurityException("OFFLINE_OWNER_AUTH_REJECTED");
        String[] parts = token.split("\\.", -1);
        if (parts.length != 3) throw new SecurityException("OFFLINE_OWNER_AUTH_REJECTED");
        JSONObject claims = new JSONObject(new String(
            Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP), StandardCharsets.UTF_8));
        if (!env.concat("/auth/v1").equals(claims.optString("iss")) ||
            !owner.equals(claims.optString("sub")) ||
            !session.equals(claims.optString("session_id")) ||
            !"authenticated".equals(claims.optString("role"))) {
            throw new SecurityException("OFFLINE_OWNER_AUTH_REJECTED");
        }
        return claims; // Continuity metadata only; the HTTPS GET authenticates it.
    }

    private void verifyUser(String env, String token, String apiKey, String owner) throws Exception {
        if (apiKey == null || apiKey.length() > 8192 ||
            !(apiKey.startsWith("sb_publishable_") || apiKey.startsWith("eyJ"))) {
            throw new SecurityException("OFFLINE_OWNER_AUTH_REJECTED");
        }
        if (apiKey.startsWith("eyJ")) {
            String[] parts = apiKey.split("\\.", -1);
            if (parts.length != 3 || !"anon".equals(new JSONObject(new String(
                Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP),
                StandardCharsets.UTF_8)).optString("role"))) {
                throw new SecurityException("OFFLINE_OWNER_AUTH_REJECTED");
            }
        }
        HttpsURLConnection connection = (HttpsURLConnection) new URL(env + "/auth/v1/user").openConnection();
        connection.setRequestMethod("GET");
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("apikey", apiKey);
        connection.setRequestProperty("Accept", "application/json");
        try {
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) throw new SecurityException("OFFLINE_OWNER_AUTH_REJECTED");
            if (status != 200) throw new java.io.IOException("OFFLINE_OWNER_SERVICE_UNAVAILABLE");
            try (InputStream stream = connection.getInputStream();
                 ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[2048];
                int count;
                while ((count = stream.read(buffer)) != -1) {
                    bytes.write(buffer, 0, count);
                    if (bytes.size() > 65536) throw new SecurityException("OFFLINE_OWNER_AUTH_REJECTED");
                }
                if (!owner.equals(new JSONObject(bytes.toString("UTF-8")).optString("id"))) {
                    throw new SecurityException("OFFLINE_OWNER_AUTH_REJECTED");
                }
            }
        } finally { connection.disconnect(); }
    }

    private void resolveBound(PluginCall call, String origin, JSObject result) {
        getActivity().runOnUiThread(() -> {
            try {
                if (!origin.equals(callerOrigin())) throw new SecurityException();
                call.resolve(result);
            } catch (Exception ignored) { call.reject("Offline owner unavailable", "OFFLINE_OWNER_ORIGIN_REJECTED"); }
        });
    }

    @PluginMethod
    public void sealAfterVerifiedOnlineAuth(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            final String origin, env, owner, session, apiKey;
            final long generation;
            try {
                origin = callerOrigin(); env = environment(call);
                owner = uuid(call.getString("ownerId")); session = uuid(call.getString("sessionId"));
                apiKey = call.getString("publishableKey");
                synchronized (LOCK) { generation = prefs().getLong("generation", 0); }
            } catch (Exception error) {
                revokeQuietly(); call.reject("Offline owner unavailable", "OFFLINE_OWNER_CONTEXT_REJECTED"); return;
            }
            // Capacitor debug logging serializes PluginCall options. Never put
            // access/refresh tokens in those options or saved activity state.
            // Read only the current SDK session inside the trusted WebView;
            // the value callback stays native and is not a plugin response.
            String storageKey = "sb-" + Uri.parse(env).getHost().split("\\.")[0] + "-auth-token";
            String script = "(function(){try{var s=JSON.parse(window.localStorage.getItem(" +
                JSONObject.quote(storageKey) + ")||'null');return s&&typeof s.access_token==='string'?" +
                "s.access_token:null;}catch(e){return null;}})()";
            getBridge().getWebView().evaluateJavascript(script, raw -> {
                try {
                    if (!origin.equals(callerOrigin())) throw new SecurityException();
                    synchronized (LOCK) {
                        if (generation != prefs().getLong("generation", 0)) throw new SecurityException();
                    }
                    Object value = new org.json.JSONTokener(raw).nextValue();
                    if (!(value instanceof String)) throw new SecurityException();
                    sealNativeSession(call, origin, env, owner, session, (String) value, apiKey, generation);
                } catch (Exception invalid) {
                    synchronized (LOCK) {
                        if (generation == prefs().getLong("generation", 0)) revokeQuietly();
                    }
                    call.reject("Offline owner unavailable", "OFFLINE_OWNER_CONTEXT_REJECTED");
                }
            });
        });
    }

    private void sealNativeSession(PluginCall call, String origin, String env, String owner,
        String session, String token, String apiKey, long generation) {
            worker.execute(() -> {
                try {
                    claims(token, env, owner, session);
                    verifyUser(env, token, apiKey, owner);
                    synchronized (LOCK) {
                        if (generation != prefs().getLong("generation", 0)) {
                            throw new SecurityException("OFFLINE_OWNER_STALE_AUTH");
                        }
                        String install = installId(true);
                        long commitGeneration = generation;
                        String previous = prefs().getString("proof", null);
                        if (previous != null) {
                            boolean sameSession = false;
                            try {
                                JSONObject old = new JSONObject(new String(decryptProof(
                                    key(install, generation, false), aad(install, generation, env, origin),
                                    Base64.decode(previous, Base64.NO_WRAP)), StandardCharsets.UTF_8));
                                sameSession = owner.equals(old.optString("ownerId")) &&
                                    session.equals(old.optString("sessionId"));
                            } catch (Exception invalidOldProof) { /* Revoke before rebinding. */ }
                            if (!sameSession) {
                                revokeLocked(); // Old account/session proof cannot be replayed.
                                commitGeneration = prefs().getLong("generation", 0);
                            }
                        }
                        JSONObject proof = new JSONObject()
                            .put("version", 1).put("ownerId", owner).put("sessionId", session)
                            .put("environment", env).put("origin", origin)
                            .put("install", install).put("verifiedAt", System.currentTimeMillis());
                        byte[] encrypted = encryptProof(key(install, commitGeneration, true),
                            aad(install, commitGeneration, env, origin), proof.toString().getBytes(StandardCharsets.UTF_8));
                        if (!prefs().edit().putString("proof", Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit()) {
                            throw new SecurityException("OFFLINE_OWNER_STORAGE_FAILED");
                        }
                    }
                    JSObject result = new JSObject(); result.put("userId", owner);
                    resolveBound(call, origin, result);
                } catch (java.io.IOException transientFailure) {
                    call.reject("Offline owner verification unavailable", "OFFLINE_OWNER_SERVICE_UNAVAILABLE");
                } catch (Exception invalid) {
                    // Never revoke a newer login because an older request finished late.
                    synchronized (LOCK) {
                        if (generation == prefs().getLong("generation", 0)) revokeQuietly();
                    }
                    String code = "OFFLINE_OWNER_AUTH_REJECTED".equals(invalid.getMessage())
                        ? "OFFLINE_OWNER_AUTH_REJECTED" : "OFFLINE_OWNER_PROOF_UNAVAILABLE";
                    call.reject("Offline owner unavailable", code);
                }
            });
    }

    @PluginMethod
    public void readAndVerifyOfflineOwner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                String origin = callerOrigin(), env = environment(call);
                String owner = uuid(call.getString("ownerId")), session = uuid(call.getString("sessionId"));
                JSObject result = new JSObject();
                synchronized (LOCK) {
                    String encoded = prefs().getString("proof", null), install = installId(false);
                    if (encoded != null && install != null) {
                        long generation = prefs().getLong("generation", 0);
                        JSONObject proof = new JSONObject(new String(decryptProof(key(install, generation, false),
                            aad(install, generation, env, origin), Base64.decode(encoded, Base64.NO_WRAP)),
                            StandardCharsets.UTF_8));
                        if (proof.optInt("version") != 1 ||
                            !owner.equals(proof.optString("ownerId")) || !session.equals(proof.optString("sessionId")) ||
                            !env.equals(proof.optString("environment")) || !origin.equals(proof.optString("origin")) ||
                            !install.equals(proof.optString("install"))) throw new SecurityException();
                        result.put("userId", owner);
                    }
                }
                call.resolve(result);
            } catch (Exception invalid) {
                revokeQuietly(); call.reject("Offline owner unavailable", "OFFLINE_OWNER_PROOF_REJECTED");
            }
        });
    }

    /**
     * Builds a redacted result for the independent, strictly read-only proof
     * inspection. Null flags are omitted when a check was not reached.
     */
    private JSObject offlineOwnerInspectionResult(
        String status, Boolean keyAliasPresent, Boolean proofDecryptable,
        Boolean ownerMatchesExpected, Boolean sessionMatchesExpected,
        Boolean environmentMatches, Boolean originMatches,
        Boolean installBindingMatches, Boolean persistentStateUnchanged) {
        JSObject result = new JSObject();
        result.put("status", status);
        if (keyAliasPresent != null) result.put("keyAliasPresent", keyAliasPresent);
        if (proofDecryptable != null) result.put("proofDecryptable", proofDecryptable);
        if (ownerMatchesExpected != null) result.put("ownerMatchesExpected", ownerMatchesExpected);
        if (sessionMatchesExpected != null) result.put("sessionMatchesExpected", sessionMatchesExpected);
        if (environmentMatches != null) result.put("environmentMatches", environmentMatches);
        if (originMatches != null) result.put("originMatches", originMatches);
        if (installBindingMatches != null) result.put("installBindingMatches", installBindingMatches);
        if (persistentStateUnchanged != null) {
            result.put("persistentStateUnchanged", persistentStateUnchanged);
        }
        return result;
    }

    private Boolean offlineOwnerStateUnchanged(
        SharedPreferences preferences, String proof, String install, long generation,
        KeyStore keyStore, String keyAlias, Boolean expectedAliasPresent) {
        boolean preferencesUnchanged =
            java.util.Objects.equals(proof, preferences.getString("proof", null)) &&
            java.util.Objects.equals(install, preferences.getString("install", null)) &&
            generation == preferences.getLong("generation", 0);
        if (!preferencesUnchanged) return false;
        if (expectedAliasPresent == null) return null;
        try {
            return keyStore.containsAlias(keyAlias) == expectedAliasPresent.booleanValue();
        } catch (Exception unavailable) {
            return null;
        }
    }

    private JSObject inspectOfflineOwnerProofLocked(
        String env, String origin, String owner, String session) {
        try {
            SharedPreferences preferences = prefs();
            String proofValue = preferences.getString("proof", null);
            String install = preferences.getString("install", null);
            long generation = preferences.getLong("generation", 0);

            if (proofValue == null || install == null) {
                Boolean unchanged = offlineOwnerStateUnchanged(
                    preferences, proofValue, install, generation, null, null, null);
                return offlineOwnerInspectionResult(
                    "missing_binding", null, null, null, null, null, null, null, unchanged);
            }

            String keyAlias = alias(install, generation);
            KeyStore keyStore;
            try {
                keyStore = KeyStore.getInstance("AndroidKeyStore");
                keyStore.load(null);
            } catch (Exception unavailable) {
                Boolean unchanged = offlineOwnerStateUnchanged(
                    preferences, proofValue, install, generation, null, null, null);
                return offlineOwnerInspectionResult(
                    "keystore_unavailable", null, null, null, null, null, null, null, unchanged);
            }

            final boolean keyAliasPresent;
            try {
                keyAliasPresent = keyStore.containsAlias(keyAlias);
            } catch (Exception unavailable) {
                Boolean unchanged = offlineOwnerStateUnchanged(
                    preferences, proofValue, install, generation, null, null, null);
                return offlineOwnerInspectionResult(
                    "keystore_unavailable", null, null, null, null, null, null, null, unchanged);
            }

            if (!keyAliasPresent) {
                Boolean unchanged = offlineOwnerStateUnchanged(
                    preferences, proofValue, install, generation, keyStore, keyAlias, false);
                return offlineOwnerInspectionResult(
                    "key_missing", false, false, null, null, null, null, null, unchanged);
            }

            final SecretKey secret;
            try {
                secret = (SecretKey) keyStore.getKey(keyAlias, null);
            } catch (Exception unavailable) {
                Boolean unchanged = offlineOwnerStateUnchanged(
                    preferences, proofValue, install, generation, keyStore, keyAlias, true);
                return offlineOwnerInspectionResult(
                    "keystore_unavailable", true, null, null, null, null, null, null, unchanged);
            }
            if (secret == null) {
                Boolean unchanged = offlineOwnerStateUnchanged(
                    preferences, proofValue, install, generation, keyStore, keyAlias, true);
                return offlineOwnerInspectionResult(
                    "key_missing", true, false, null, null, null, null, null, unchanged);
            }

            byte[] plaintext = null;
            boolean decryptable = false;
            String status = "proof_invalid";
            Boolean ownerMatches = null;
            Boolean sessionMatches = null;
            Boolean environmentMatches = null;
            Boolean originMatches = null;
            Boolean installMatches = null;
            try {
                plaintext = decryptProof(
                    secret, aad(install, generation, env, origin),
                    Base64.decode(proofValue, Base64.NO_WRAP));
                decryptable = true;
                JSONObject proof = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
                if (proof.optInt("version", -1) == 1) {
                    ownerMatches = owner.equals(proof.optString("ownerId"));
                    sessionMatches = session.equals(proof.optString("sessionId"));
                    environmentMatches = env.equals(proof.optString("environment"));
                    originMatches = origin.equals(proof.optString("origin"));
                    installMatches = install.equals(proof.optString("install"));
                    status = ownerMatches && sessionMatches && environmentMatches &&
                        originMatches && installMatches ? "valid" : "binding_mismatch";
                }
            } catch (Exception invalidProof) {
                status = "proof_invalid";
            } finally {
                if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
            }

            Boolean unchanged = offlineOwnerStateUnchanged(
                preferences, proofValue, install, generation, keyStore, keyAlias, true);
            if (Boolean.FALSE.equals(unchanged)) {
                status = "state_changed_during_inspection";
            } else if (unchanged == null) {
                status = "inspection_unavailable";
            }
            return offlineOwnerInspectionResult(
                status, true, decryptable, ownerMatches, sessionMatches,
                environmentMatches, originMatches, installMatches, unchanged);
        } catch (Exception unavailable) {
            return offlineOwnerInspectionResult(
                "inspection_unavailable", null, null, null, null, null, null, null, null);
        }
    }

    @PluginMethod
    public void inspectOfflineOwnerProofReadOnly(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            final String origin;
            try {
                origin = callerOrigin();
            } catch (Exception rejectedOrigin) {
                call.reject("Offline owner diagnostic unavailable", "OFFLINE_OWNER_CONTEXT_REJECTED");
                return;
            }

            final String env, owner, session;
            try {
                env = environment(call);
                owner = uuid(call.getString("ownerId"));
                session = uuid(call.getString("sessionId"));
            } catch (Exception rejectedContext) {
                call.resolve(offlineOwnerInspectionResult(
                    "context_rejected", null, null, null, null, null, null, null, null));
                return;
            }

            worker.execute(() -> {
                JSObject result;
                synchronized (LOCK) {
                    result = inspectOfflineOwnerProofLocked(env, origin, owner, session);
                }
                resolveBound(call, origin, result);
            });
        });
    }

    @PluginMethod
    public void revokeOfflineOwner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                callerOrigin();
                synchronized (LOCK) { revokeLocked(); }
                call.resolve();
            } catch (Exception invalid) { call.reject("Offline owner unavailable", "OFFLINE_OWNER_REVOCATION_FAILED"); }
        });
    }
}
