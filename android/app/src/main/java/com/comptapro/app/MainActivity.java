package com.comptapro.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    private ValueCallback<Uri[]> filePathCallback;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),
            new ActivityResultCallback<ActivityResult>() {
                @Override
                public void onActivityResult(ActivityResult result) {
                    if (filePathCallback == null) return;
                    Uri[] results = null;
                    if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                        Uri data = result.getData().getData();
                        if (data != null) { results = new Uri[]{ data }; }
                    }
                    filePathCallback.onReceiveValue(results);
                    filePathCallback = null;
                }
            });

    @Override
    public void onStart() {
        super.onStart();
        final WebView webView = this.bridge.getWebView();

        webView.addJavascriptInterface(new PrintBridge(webView), "AndroidPrint");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        request.grant(request.getResources());
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) { filePathCallback.onReceiveValue(null); }
                filePathCallback = callback;
                try {
                    fileChooserLauncher.launch(params.createIntent());
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    public class PrintBridge {
        private final WebView webView;
        PrintBridge(WebView wv) { this.webView = wv; }

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                try {
                    PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    String jobName = "ComptaPro";
                    PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                    pm.print(jobName, adapter, new PrintAttributes.Builder().build());
                } catch (Exception e) {}
            });
        }

        @JavascriptInterface
        public void savePdf(String base64Data, String filename) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                    String name = (filename == null || filename.isEmpty()) ? "document.pdf" : filename;
                    if (!name.toLowerCase().endsWith(".pdf")) name = name + ".pdf";

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                        values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                        values.put(MediaStore.Downloads.IS_PENDING, 1);
                        ContentResolver resolver = getContentResolver();
                        Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (item != null) {
                            OutputStream os = resolver.openOutputStream(item);
                            os.write(bytes);
                            os.close();
                            values.clear();
                            values.put(MediaStore.Downloads.IS_PENDING, 0);
                            resolver.update(item, values, null, null);
                            Toast.makeText(MainActivity.this, "PDF enregistré dans Téléchargements", Toast.LENGTH_LONG).show();
                        }
                    } else {
                        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        if (!dir.exists()) dir.mkdirs();
                        File file = new File(dir, name);
                        FileOutputStream fos = new FileOutputStream(file);
                        fos.write(bytes);
                        fos.close();
                        Toast.makeText(MainActivity.this, "PDF enregistré dans Téléchargements", Toast.LENGTH_LONG).show();
                    }
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Erreur enregistrement PDF", Toast.LENGTH_LONG).show();
                }
            });
        }
    }
}