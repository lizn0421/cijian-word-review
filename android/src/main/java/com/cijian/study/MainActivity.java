package com.cijian.study;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME_URL = "https://" + HOST + "/index.html";
    private static final int IMPORT = 100;
    private static final int EXPORT = 101;

    private WebView page;
    private ValueCallback<Uri[]> fileSelection;
    private TextToSpeech speech;
    private boolean speechReady;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.rgb(27, 91, 74));
        getWindow().setNavigationBarColor(Color.rgb(22, 72, 61));
        speech = new TextToSpeech(this, result -> {
            if (result == TextToSpeech.SUCCESS && speech != null) {
                speechReady = speech.setLanguage(Locale.US) >= TextToSpeech.LANG_AVAILABLE;
                speech.setSpeechRate(0.88f);
            }
        });

        page = new WebView(this);
        page.setBackgroundColor(Color.rgb(247, 246, 239));
        page.getSettings().setJavaScriptEnabled(true);
        page.getSettings().setDomStorageEnabled(true);
        page.getSettings().setAllowFileAccess(false);
        page.addJavascriptInterface(new AppBridge(), "CijianAndroid");
        page.setWebViewClient(new LocalClient());
        page.setWebChromeClient(new PickerClient());
        setContentView(page);
        page.loadUrl(HOME_URL);
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1;
    }

    private final class LocalClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (local(uri)) {
                String name = uri.getPath();
                String mime;
                if ("/index.html".equals(name)) mime = "text/html";
                else if ("/style.css".equals(name)) mime = "text/css";
                else if ("/app.js".equals(name) || "/core.js".equals(name)) mime = "application/javascript";
                else if ("/icon.png".equals(name) || "/icon-192.png".equals(name)) mime = "image/png";
                else if ("/manifest.webmanifest".equals(name)) mime = "application/manifest+json";
                else return blocked();
                try {
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open("web" + name));
                } catch (IOException error) {
                    return blocked();
                }
            }
            return blocked();
        }

        private WebResourceResponse blocked() {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    java.util.Collections.emptyMap(), null);
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return openOutside(request.getUrl(), request.isForMainFrame());
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openOutside(Uri.parse(url), true);
        }

        private boolean openOutside(Uri uri, boolean mainFrame) {
            if (local(uri)) return false;
            if (mainFrame && "https".equals(uri.getScheme()) && "translate.google.com".equals(uri.getHost())) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException error) {
                    notifyUser("手机上没有可打开 Google 翻译的应用。");
                }
            }
            return true;
        }
    }

    private final class PickerClient extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                FileChooserParams params) {
            if (fileSelection != null) fileSelection.onReceiveValue(null);
            fileSelection = callback;
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            // Providers sometimes assign CSV and JSON a generic MIME type.
            picker.setType("*/*");
            try {
                startActivityForResult(picker, IMPORT);
            } catch (ActivityNotFoundException error) {
                fileSelection = null;
                callback.onReceiveValue(null);
                notifyUser("系统文件选择器不可用。");
            }
            return true;
        }
    }

    private File pendingBackup() { return new File(getCacheDir(), "pending-backup.json"); }

    private final class AppBridge {
        @JavascriptInterface public void exportBackup(String filename, String json) {
            if (json == null || json.length() > 8 * 1024 * 1024) {
                runOnUiThread(() -> notifyUser("备份文件过大。"));
                return;
            }
            try (FileOutputStream target = new FileOutputStream(pendingBackup())) {
                target.write(json.getBytes(StandardCharsets.UTF_8));
            } catch (IOException error) {
                runOnUiThread(() -> notifyUser("无法准备备份文件。"));
                return;
            }
            runOnUiThread(() -> {
                Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("application/json");
                picker.putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    startActivityForResult(picker, EXPORT);
                } catch (ActivityNotFoundException error) {
                    pendingBackup().delete();
                    notifyUser("系统文件选择器不可用。");
                }
            });
        }

        @JavascriptInterface public void speak(String value) {
            runOnUiThread(() -> {
                if (!speechReady || speech == null ||
                        speech.speak(value, TextToSpeech.QUEUE_FLUSH, null, "cijian") == TextToSpeech.ERROR) {
                    notifyUser("请在系统文字转语音设置中启用英文语音。");
                }
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (uri != null && !"content".equals(uri.getScheme())) uri = null;
        if (request == IMPORT && fileSelection != null) {
            ValueCallback<Uri[]> callback = fileSelection;
            fileSelection = null;
            callback.onReceiveValue(uri == null ? null : new Uri[]{uri});
        } else if (request == EXPORT) {
            if (uri == null) pendingBackup().delete();
            else writeBackup(uri);
        }
    }

    private void writeBackup(Uri uri) {
        new Thread(() -> {
            boolean success = false;
            try (FileInputStream source = new FileInputStream(pendingBackup());
                 OutputStream target = getContentResolver().openOutputStream(uri, "wt")) {
                if (target == null) throw new IOException("Unable to open document");
                byte[] buffer = new byte[8192];
                int bytes;
                while ((bytes = source.read(buffer)) != -1) target.write(buffer, 0, bytes);
                target.flush();
                success = true;
            } catch (IOException | SecurityException error) {
                success = false;
            } finally {
                pendingBackup().delete();
            }
            String message = success ? "备份已保存。" : "备份写入失败，请重试。";
            runOnUiThread(() -> notifyUser(message));
        }, "write-cijian-backup").start();
    }

    private void notifyUser(String message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }

    @Override protected void onDestroy() {
        if (fileSelection != null) fileSelection.onReceiveValue(null);
        if (speech != null) speech.shutdown();
        page.destroy();
        super.onDestroy();
    }
}
