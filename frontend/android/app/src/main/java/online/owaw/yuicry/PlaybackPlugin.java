package online.owaw.yuicry;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Playback")
public class PlaybackPlugin extends Plugin {

    private PowerManager.WakeLock wakeLock;

    private PowerManager.WakeLock lock() {
        if (wakeLock == null) {
            PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (power != null) {
                wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "yuicry:playback");
                wakeLock.setReferenceCounted(false);
            }
        }

        return wakeLock;
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Context context = getContext();
            PowerManager.WakeLock held = lock();

            if (held != null && !held.isHeld()) {
                held.acquire();
            }

            Intent intent = new Intent(context, PlaybackService.class);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }

            call.resolve();
        } catch (RuntimeException error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), PlaybackService.class));

            PowerManager.WakeLock held = lock();
            if (held != null && held.isHeld()) {
                held.release();
            }

            call.resolve();
        } catch (RuntimeException error) {
            call.reject(error.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));

        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }

        super.handleOnDestroy();
    }
}
