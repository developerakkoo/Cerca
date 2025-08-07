package io.ionic.starter;
import android.os.Bundle;
import android.webkit.WebView;
import android.graphics.Color;

import com.getcapacitor.BridgeActivity;


public class MainActivity extends BridgeActivity {
     @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = (WebView) this.bridge.getWebView();
    webView.setBackgroundColor(Color.TRANSPARENT); // 👈 CRITICAL
  }
}
