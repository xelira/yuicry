package online.owaw.yuicry;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

public class PlaybackService extends Service {

    private static final String CHANNEL = "playback";
    private static final int NOTIFICATION_ID = 1;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        channel();

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);

        PendingIntent open = PendingIntent.getActivity(
                this,
                0,
                new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = builder
                .setContentTitle("yuicry")
                .setContentText("Трек играет")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(open)
                .setOngoing(true)
                .setShowWhen(false)
                .build();

        try {
            startForeground(NOTIFICATION_ID, notification);
        } catch (RuntimeException error) {
            stopSelf();
            return START_NOT_STICKY;
        }

        return START_STICKY;
    }

    private void channel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        if (manager.getNotificationChannel(CHANNEL) != null) return;

        NotificationChannel created = new NotificationChannel(
                CHANNEL, "Воспроизведение", NotificationManager.IMPORTANCE_LOW);
        created.setShowBadge(false);
        manager.createNotificationChannel(created);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
