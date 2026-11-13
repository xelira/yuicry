package online.owaw.yuicry;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.WindowInsetsController;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Host")
public class HostPlugin extends Plugin {

    @PluginMethod
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme", "dark");

        getActivity().runOnUiThread(() -> apply(theme));
        call.resolve();
    }

    private void apply(String theme) {
        Activity activity = getActivity();
        if (activity == null) return;

        boolean light = "light".equals(theme);
        int background = Color.parseColor(light ? "#faf9f7" : "#0b0b0d");

        activity.getWindow().getDecorView().setBackgroundColor(background);
        getBridge().getWebView().setBackgroundColor(background);

        activity.getWindow().setStatusBarColor(Color.TRANSPARENT);
        activity.getWindow().setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = activity.getWindow().getInsetsController();
            if (controller == null) return;

            int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;

            controller.setSystemBarsAppearance(light ? mask : 0, mask);
            return;
        }

        View decor = activity.getWindow().getDecorView();
        int flags = decor.getSystemUiVisibility();

        if (light) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
        } else {
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
        }

        decor.setSystemUiVisibility(flags);
    }
}
