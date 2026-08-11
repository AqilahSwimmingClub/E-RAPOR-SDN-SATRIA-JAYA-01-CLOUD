package id.sch.sdn.satriajaya01.erapor;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    private static final int SAVE_DOCUMENT_REQUEST = 6011;
    private byte[] pendingDocument;
    private String pendingMime = "application/octet-stream";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new NativeFileIOBridge(this), "NativeFileIO");
        webView.addJavascriptInterface(new NativePrintBridge(this), "NativePrint");
    }

    private void saveBase64Document(String filename, String mime, String base64) {
        runOnUiThread(() -> {
            try {
                pendingDocument = Base64.decode(base64, Base64.DEFAULT);
                pendingMime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(pendingMime);
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(intent, SAVE_DOCUMENT_REQUEST);
            } catch (Exception ignored) {
                pendingDocument = null;
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != SAVE_DOCUMENT_REQUEST) return;
        byte[] document = pendingDocument;
        pendingDocument = null;
        if (resultCode != RESULT_OK || data == null || document == null) return;
        Uri uri = data.getData();
        if (uri == null) return;
        try (OutputStream stream = getContentResolver().openOutputStream(uri, "w")) {
            if (stream != null) stream.write(document);
        } catch (Exception ignored) {
            // The Storage Access Framework keeps existing application data untouched.
        }
    }

    private void printCurrentDocument(String title) {
        runOnUiThread(() -> {
            PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            String jobName = title == null || title.isEmpty() ? getString(R.string.app_name) : title;
            manager.print(jobName, getBridge().getWebView().createPrintDocumentAdapter(jobName), null);
        });
    }

    private static final class NativeFileIOBridge {
        private final MainActivity activity;
        NativeFileIOBridge(MainActivity activity) { this.activity = activity; }
        @JavascriptInterface public void saveBase64(String filename, String mime, String base64) { activity.saveBase64Document(filename, mime, base64); }
    }

    private static final class NativePrintBridge {
        private final MainActivity activity;
        NativePrintBridge(MainActivity activity) { this.activity = activity; }
        @JavascriptInterface public void printCurrentDocument(String title) { activity.printCurrentDocument(title); }
    }
}
