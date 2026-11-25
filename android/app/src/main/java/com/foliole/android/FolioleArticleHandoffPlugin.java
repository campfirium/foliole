package com.foliole.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "FolioleArticleHandoff")
public final class FolioleArticleHandoffPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("article_html_required");
            return;
        }

        File file = null;
        try {
            file = writeArticle(html);
            resolveTarget(call, file);
        } catch (IOException | IllegalArgumentException | SecurityException error) {
            if (file != null) file.delete();
            call.reject("article_handoff_failed");
        }
    }

    @PluginMethod
    public void shareSupportLog(PluginCall call) {
        String content = call.getString("text");
        if (content == null || content.isEmpty() || content.length() > 393216) {
            call.reject("support_log_invalid");
            return;
        }
        File file = null;
        try {
            File directory = new File(getContext().getCacheDir(), "support-log-export");
            if (!directory.mkdirs() && !directory.isDirectory()) throw new IOException("support_log_cache_unavailable");
            long expiry = System.currentTimeMillis() - TimeUnit.HOURS.toMillis(24);
            File[] expired = directory.listFiles(entry -> entry.getName().startsWith("foliole-log-")
                && entry.getName().endsWith(".txt") && entry.lastModified() < expiry);
            if (expired != null) for (File entry : expired) entry.delete();
            file = File.createTempFile("foliole-log-", ".txt", directory);
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(content.getBytes(StandardCharsets.UTF_8));
            }
            shareLogFile(call, file);
        } catch (IOException | IllegalArgumentException | SecurityException error) {
            if (file != null) file.delete();
            call.reject("support_log_export_failed");
        }
    }

    /** Saves one stored library attachment through the system save dialog; bytes never pass through the WebView. */
    @PluginMethod
    public void saveAttachment(PluginCall call) {
        File file = attachmentFile(call);
        String name = call.getString("file_name");
        if (file == null || name == null || name.trim().isEmpty()) {
            resolve(call, "unavailable");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(call.getString("mime_type")).putExtra(Intent.EXTRA_TITLE, name.trim());
        try {
            startActivityForResult(call, intent, "attachmentSaveTarget");
        } catch (ActivityNotFoundException error) {
            resolve(call, "unavailable");
        }
    }

    @ActivityCallback
    private void attachmentSaveTarget(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            resolve(call, "cancelled");
            return;
        }
        File file = attachmentFile(call);
        if (file == null) {
            resolve(call, "unavailable");
            return;
        }
        Uri target = data.getData();
        new Thread(() -> {
            try (InputStream input = new FileInputStream(file);
                 OutputStream output = getContext().getContentResolver().openOutputStream(target, "wt")) {
                if (output == null) throw new IOException("attachment_target_unavailable");
                byte[] buffer = new byte[65536];
                for (int read = input.read(buffer); read != -1; read = input.read(buffer)) output.write(buffer, 0, read);
                resolve(call, "saved");
            } catch (IOException | SecurityException | IllegalArgumentException error) {
                call.reject("attachment_save_failed");
            }
        }, "FolioleAttachmentSave").start();
    }

    private File attachmentFile(PluginCall call) {
        String storageKey = call.getString("storage_key");
        String contentHash = call.getString("content_hash");
        String mimeType = call.getString("mime_type");
        if (storageKey == null || contentHash == null || mimeType == null ||
            !FolioleCompanionCanonicalAttachmentKey.matches(contentHash, mimeType, storageKey)) return null;
        File file = new File(new File(getContext().getFilesDir(), "attachments"), storageKey.trim());
        return file.isFile() ? file : null;
    }

    private void shareLogFile(PluginCall call, File file) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        send.setClipData(ClipData.newRawUri("Foliole log", uri));
        getActivity().runOnUiThread(() -> launch(call, file, Intent.createChooser(send, null)));
    }

    private File writeArticle(String html) throws IOException {
        File directory = new File(getContext().getCacheDir(), "article-handoff");
        if (!directory.mkdirs() && !directory.isDirectory()) throw new IOException("article_cache_unavailable");
        long expiry = System.currentTimeMillis() - TimeUnit.HOURS.toMillis(24);
        File[] expired = directory.listFiles(file -> file.getName().startsWith("article-")
            && file.getName().endsWith(".html") && file.lastModified() < expiry);
        if (expired != null) for (File file : expired) file.delete();
        File file = File.createTempFile("article-", ".html", directory);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(html.getBytes(StandardCharsets.UTF_8));
        } catch (IOException error) {
            file.delete();
            throw error;
        }
        return file;
    }

    private void resolveTarget(PluginCall call, File file) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "text/html")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        view.setClipData(ClipData.newRawUri("Article", uri));
        int handlers = getContext().getPackageManager()
            .queryIntentActivities(view, PackageManager.MATCH_DEFAULT_ONLY).size();
        if (handlers == 0) {
            file.delete();
            resolve(call, "unavailable");
            return;
        }
        getActivity().runOnUiThread(() -> launch(call, file, handlers == 1 ? view : Intent.createChooser(view, null)));
    }

    private void launch(PluginCall call, File file, Intent intent) {
        try {
            getActivity().startActivity(intent);
            resolve(call, "presented");
        } catch (ActivityNotFoundException error) {
            file.delete();
            resolve(call, "unavailable");
        } catch (SecurityException error) {
            file.delete();
            call.reject("article_handoff_failed");
        }
    }

    private void resolve(PluginCall call, String status) {
        call.resolve(new JSObject().put("status", status));
    }
}
