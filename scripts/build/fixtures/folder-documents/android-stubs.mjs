import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Android provider seams use actual temporary files; the production prepare method is unchanged.
const stubs = {
  'android/net/Uri.java': `package android.net;
public record Uri(String value) { public static Uri parse(String value) { return new Uri(value); } }`,
  'android/content/Context.java': `package android.content;
public class Context {
  public final ContentResolver resolver = new ContentResolver();
  public ContentResolver getContentResolver() { return resolver; }
}`,
  'android/content/ContentResolver.java': `package android.content;
import android.os.ParcelFileDescriptor;
import android.net.Uri;
import android.database.Cursor;
public class ContentResolver {
  public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
  public String getType(Uri uri) {
    return java.nio.file.Files.isDirectory(java.nio.file.Path.of(uri.value()))
      ? "vnd.android.document/directory" : "application/octet-stream";
  }
  public ParcelFileDescriptor openFileDescriptor(Uri uri, String mode) throws Exception {
    return new ParcelFileDescriptor(uri.value());
  }
}`,
  'android/database/Cursor.java': `package android.database;
public interface Cursor extends AutoCloseable {
  boolean moveToNext(); String getString(int column); void close();
}`,
  'android/os/ParcelFileDescriptor.java': `package android.os;
import java.io.RandomAccessFile;
public class ParcelFileDescriptor implements AutoCloseable {
  private final RandomAccessFile file;
  public ParcelFileDescriptor(String path) throws Exception { file = new RandomAccessFile(path, "r"); }
  public long getStatSize() throws Exception { return file.length(); }
  public int detachFd() { return -1; }
  public void close() throws Exception { file.close(); }
}`,
  'android/provider/DocumentsContract.java': `package android.provider;
import android.content.ContentResolver;
import android.net.Uri;
import java.nio.file.Files;
import java.nio.file.Path;
public class DocumentsContract {
  public static boolean crashAfterCreate, failBeforeCreate;
  public static String failNextRenameTo;
  public static class Document {
    public static final String COLUMN_DISPLAY_NAME = "name", COLUMN_DOCUMENT_ID = "id";
    public static final String MIME_TYPE_DIR = "vnd.android.document/directory";
  }
  public static String getTreeDocumentId(Uri tree) { return tree.value(); }
  public static String getDocumentId(Uri document) { return document.value(); }
  public static Uri buildDocumentUriUsingTree(Uri tree, String id) { return Uri.parse(id); }
  public static Uri buildChildDocumentsUriUsingTree(Uri tree, String id) { return Uri.parse(id); }
  public static Uri createDocument(ContentResolver resolver, Uri root, String type, String name) throws Exception {
    Path file = Path.of(root.value(), name);
    if (failBeforeCreate) { failBeforeCreate = false; throw new Exception("backup creation failed"); }
    Files.createFile(file);
    if (crashAfterCreate) { crashAfterCreate = false; throw new Exception("process stopped after create"); }
    return Uri.parse(file.toString());
  }
  public static Uri renameDocument(ContentResolver resolver, Uri file, String name) throws Exception {
    if (name.equals(failNextRenameTo)) {
      failNextRenameTo = null;
      throw new Exception("backup publication failed");
    }
    Path moved = Files.move(Path.of(file.value()), Path.of(file.value()).resolveSibling(name));
    return Uri.parse(moved.toString());
  }
  public static boolean deleteDocument(ContentResolver resolver, Uri file) throws Exception {
    return Files.deleteIfExists(Path.of(file.value()));
  }
}`,
  'com/foliole/android/FolioleCompanionBridgeContractDefinitions.java': `package com.foliole.android;
import android.content.Context;
class FolioleCompanionBridgeContractDefinitions {
  static String hostApiString(Context context, String group, String field) { return "Foliole.sqlite"; }
}`
};

export function writeFolderDocumentStubs(root) {
  return Object.entries(stubs).map(([name, source]) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
    return file;
  });
}
