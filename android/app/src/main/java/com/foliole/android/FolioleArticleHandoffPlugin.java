package com.foliole.android;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "FolioleArticleHandoff")
public final class FolioleArticleHandoffPlugin extends Plugin {
    private static final int MARKDOWN_EXPORT_LIMIT = 16 * 1024 * 1024;

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

    @PluginMethod
    public void shareMarkdown(PluginCall call) {
        String content = call.getString("text");
        String name = call.getString("fileName");
        if (content == null || content.isEmpty() || content.length() > MARKDOWN_EXPORT_LIMIT
            || name == null || !name.endsWith(".md") || name.contains("/") || name.contains("\\")) {
            call.reject("article_markdown_invalid");
            return;
        }
        File directory = null;
        try {
            File root = new File(getContext().getCacheDir(), "article-markdown");
            if (!root.mkdirs() && !root.isDirectory()) throw new IOException("article_markdown_cache_unavailable");
            long expiry = System.currentTimeMillis() - TimeUnit.HOURS.toMillis(24);
            File[] expired = root.listFiles(entry -> entry.isDirectory() && entry.lastModified() < expiry);
            if (expired != null) for (File entry : expired) deleteExport(entry);
            directory = new File(root, UUID.randomUUID().toString());
            if (!directory.mkdirs()) throw new IOException("article_markdown_cache_unavailable");
            File file = new File(directory, name);
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(content.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/markdown")
                .putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_TITLE, name)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri(name, uri));
            File exportDirectory = directory;
            getActivity().runOnUiThread(() -> launch(call, exportDirectory, Intent.createChooser(send, null)));
        } catch (IOException | IllegalArgumentException | SecurityException error) {
            if (directory != null) deleteExport(directory);
            call.reject("article_markdown_export_failed");
        }
    }

    private static void deleteExport(File directory) {
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) file.delete();
        directory.delete();
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
