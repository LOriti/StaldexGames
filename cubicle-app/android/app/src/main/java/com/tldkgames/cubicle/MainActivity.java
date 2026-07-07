package com.tldkgames.cubicle;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android 15 (targetSdk 35) renders the WebView edge-to-edge by default.
        // Capacitor's bridge_layout_main CoordinatorLayout doesn't set
        // fitsSystemWindows, so decorFitsSystemWindows alone doesn't inset the
        // WebView. Apply the system-bar insets as padding on the content view.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        if (content != null) {
            // Extra breathing room below the nav bar / gesture pill so action
            // buttons don't sit flush against the bottom edge. 12dp feels right.
            final int extraBottomPx = (int) (12f * getResources().getDisplayMetrics().density);
            ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom + extraBottomPx);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(content);
        }
    }
}
