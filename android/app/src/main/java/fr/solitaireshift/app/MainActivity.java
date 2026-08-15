package fr.solitaireshift.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

/**
 * The whole app: a full-screen WebView serving the game from the APK's own
 * assets. Nothing is fetched from the network, so the game works offline from
 * the moment it is installed and needs no server, no domain and no HTTPS.
 *
 * The game already persists everything in localStorage, which the WebView
 * keeps in the app's private storage — so progress survives restarts and is
 * removed cleanly when the app is uninstalled.
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // draw behind the system bars: the game paints its own background
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.parseColor("#1fc0ad"));
        getWindow().setNavigationBarColor(Color.parseColor("#1fc0ad"));
        // a card game is a "keep looking at it" app; don't dim mid-hand
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);       // localStorage: the save file
        s.setAllowFileAccess(false);        // assets are reached via the loader below
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false); // WebAudio sound effects
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);                 // ignore the system font scale: the
                                            // board is laid out in vw/vmin units

        webView.setBackgroundColor(Color.parseColor("#1fc0ad"));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // Served through a virtual https:// origin so the engine treats it as
        // a secure context. That is what lets localStorage and ES modules
        // behave exactly as they do on the web build — with no real network.
        // The client also keeps every navigation inside the app.
        webView.setWebViewClient(new LocalAssetWebViewClient(this));
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");

        // Android's back gesture should undo a move, not close the game.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(function(){"
                    + "  var a = window.__solitaire;"
                    + "  if (!a) return 'exit';"
                    + "  if (document.getElementById('modal-root').children.length) {"
                    + "    a.showMenu(); return 'handled';"
                    + "  }"
                    + "  if (a.game) { a.undo(); return 'handled'; }"
                    + "  return 'exit';"
                    + "})()",
                    value -> {
                        if (value != null && value.contains("exit")) {
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                        }
                    });
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}