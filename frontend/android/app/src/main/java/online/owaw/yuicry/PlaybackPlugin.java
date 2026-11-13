package online.owaw.yuicry;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

@CapacitorPlugin(name = "Playback")
public class PlaybackPlugin extends Plugin {

    public static final String COMMAND_PLAY = "play";
    public static final String COMMAND_PAUSE = "pause";
    public static final String COMMAND_NEXT = "next";
    public static final String COMMAND_PREVIOUS = "previous";
    public static final String COMMAND_LIKE = "like";
    public static final String COMMAND_SEEK = "seek";

    private static WeakReference<WebView> webView = new WeakReference<>(null);

    private PowerManager.WakeLock wakeLock;

    @Override
    public void load() {
        webView = new WeakReference<>(getBridge().getWebView());
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent intent = new Intent(getContext(), PlaybackService.class)
                .setAction(PlaybackService.ACTION_UPDATE)
                .putExtra("title", call.getString("title", ""))
                .putExtra("artist", call.getString("artist", ""))
                .putExtra("cover", call.getString("cover", ""))
                .putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)))
                .putExtra("liked", Boolean.TRUE.equals(call.getBoolean("liked", false)))
                .putExtra("position", call.getDouble("position", 0.0))
                .putExtra("duration", call.getDouble("duration", 0.0));

        requestNotifications();
        start(intent);
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Intent intent = new Intent(getContext(), PlaybackService.class)
                .setAction(PlaybackService.ACTION_SEEK)
                .putExtra("position", call.getDouble("position", 0.0));

        start(intent);
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        start(new Intent(getContext(), PlaybackService.class)
                .setAction(PlaybackService.ACTION_UPDATE));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        release();
        call.resolve();
    }

    private void start(Intent intent) {
        Context context = getContext();
        acquire();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    private void requestNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;

        Activity activity = getActivity();
        if (activity == null) return;
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }

        activity.runOnUiThread(() -> activity.requestPermissions(
                new String[]{Manifest.permission.POST_NOTIFICATIONS}, 701));
    }

    private void acquire() {
        if (wakeLock == null) {
            PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (power == null) return;

            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "yuicry:playback");
            wakeLock.setReferenceCounted(false);
        }

        if (!wakeLock.isHeld()) {
            wakeLock.acquire();
        }
    }

    private void release() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    static void dispatch(String command) {
        dispatch(command, 0);
    }

    static void dispatch(String command, double position) {
        WebView view = webView.get();
        if (view == null) return;

        String script = "window.dispatchEvent(new CustomEvent('yuicry:media',{detail:{command:'"
                + command + "',position:" + position + "}}))";

        view.post(() -> view.evaluateJavascript(script, null));
    }

    @Override
    protected void handleOnDestroy() {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        release();
        webView.clear();

        super.handleOnDestroy();
    }
}
