package fr.solitaireshift.app;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;

/**
 * Serves the bundled game from the APK's assets under a virtual
 * https://appassets.androidplatform.net origin.
 *
 * Using a real https origin (rather than file://) matters: it makes the page a
 * secure context, so localStorage, ES modules and the rest behave exactly as
 * they do in a browser. No network request ever leaves the device.
 */
public class LocalAssetWebViewClient extends WebViewClient {

    private final WebViewAssetLoader assetLoader;

    public LocalAssetWebViewClient(Context context) {
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context))
                .build();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return assetLoader.shouldInterceptRequest(request.getUrl());
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        // Everything the game needs is bundled. Refuse anything else rather
        // than handing the user off to a browser mid-game.
        return !"appassets.androidplatform.net".equals(url.getHost());
    }
}