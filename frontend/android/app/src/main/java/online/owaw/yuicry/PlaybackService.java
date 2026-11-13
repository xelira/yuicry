package online.owaw.yuicry;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.CookieManager;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PlaybackService extends Service {

    public static final String ACTION_UPDATE = "online.owaw.yuicry.action.UPDATE";
    public static final String ACTION_COMMAND = "online.owaw.yuicry.action.COMMAND";
    public static final String ACTION_SEEK = "online.owaw.yuicry.action.SEEK";

    private static final String CHANNEL = "playback";
    private static final int NOTIFICATION_ID = 1;
    private static final String BASE_URL = "https://yuicry.owaw.online";

    private final Handler handler = new Handler(Looper.getMainLooper());

    private MediaSession session;
    private ExecutorService executor;

    private String title = "yuicry";
    private String artist = "";
    private String cover = "";
    private boolean playing;
    private boolean liked;
    private long position;
    private long duration;
    private long basePosition;
    private long baseElapsed;
    private Bitmap artwork;
    private String artworkKey = "";

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (!playing) return;

            position = basePosition + (SystemClock.elapsedRealtime() - baseElapsed);
            if (duration > 0 && position > duration) position = duration;

            updateSession();
            notifyNotification();
            handler.postDelayed(this, 5000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        channel();

        executor = Executors.newSingleThreadExecutor();

        session = new MediaSession(this, "yuicry");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                PlaybackPlugin.dispatch(PlaybackPlugin.COMMAND_PLAY);
            }

            @Override
            public void onPause() {
                PlaybackPlugin.dispatch(PlaybackPlugin.COMMAND_PAUSE);
            }

            @Override
            public void onSkipToNext() {
                PlaybackPlugin.dispatch(PlaybackPlugin.COMMAND_NEXT);
            }

            @Override
            public void onSkipToPrevious() {
                PlaybackPlugin.dispatch(PlaybackPlugin.COMMAND_PREVIOUS);
            }

            @Override
            public void onSeekTo(long pos) {
                position = Math.max(0, pos);
                basePosition = position;
                baseElapsed = SystemClock.elapsedRealtime();

                updateSession();
                notifyNotification();
                PlaybackPlugin.dispatch(PlaybackPlugin.COMMAND_SEEK, position / 1000.0);
            }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_UPDATE.equals(intent.getAction())) {
            title = intent.getStringExtra("title");
            artist = intent.getStringExtra("artist");
            cover = intent.getStringExtra("cover");
            playing = intent.getBooleanExtra("playing", false);
            liked = intent.getBooleanExtra("liked", false);
            position = (long) (intent.getDoubleExtra("position", 0) * 1000);
            duration = (long) (intent.getDoubleExtra("duration", 0) * 1000);

            if (title == null) title = "yuicry";
            if (artist == null) artist = "";
            if (cover == null) cover = "";

            basePosition = position;
            baseElapsed = SystemClock.elapsedRealtime();

            handler.removeCallbacks(ticker);
            if (playing) {
                handler.postDelayed(ticker, 5000);
            }
        }

        if (intent != null && ACTION_SEEK.equals(intent.getAction())) {
            position = (long) (intent.getDoubleExtra("position", 0) * 1000);
            basePosition = position;
            baseElapsed = SystemClock.elapsedRealtime();
        }

        if (intent != null && ACTION_COMMAND.equals(intent.getAction())) {
            String command = intent.getStringExtra("command");
            if (command != null) PlaybackPlugin.dispatch(command);
        }

        updateSession();
        startForeground(NOTIFICATION_ID, build());
        loadArtwork();

        return START_STICKY;
    }

    private void updateSession() {
        if (session == null) return;

        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);

        if (artwork != null) {
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        }

        session.setMetadata(metadata.build());
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY
                        | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                        | PlaybackState.ACTION_SEEK_TO)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, position, 1f)
                .build());
    }

    private Notification build() {
        PendingIntent content = PendingIntent.getActivity(
                this,
                0,
                new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Action previous = new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_previous),
                "Назад",
                action(PlaybackPlugin.COMMAND_PREVIOUS)).build();

        Notification.Action toggle = new Notification.Action.Builder(
                Icon.createWithResource(this, playing
                        ? android.R.drawable.ic_media_pause
                        : android.R.drawable.ic_media_play),
                playing ? "Пауза" : "Играть",
                action(playing ? PlaybackPlugin.COMMAND_PAUSE : PlaybackPlugin.COMMAND_PLAY)).build();

        Notification.Action next = new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_next),
                "Вперёд",
                action(PlaybackPlugin.COMMAND_NEXT)).build();

        Notification.Action like = new Notification.Action.Builder(
                Icon.createWithResource(this, liked ? R.drawable.ic_like_filled : R.drawable.ic_like),
                liked ? "Убрать из избранного" : "Добавить в избранное",
                action(PlaybackPlugin.COMMAND_LIKE)).build();

        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(artist)
                .setContentIntent(content)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2))
                .addAction(previous)
                .addAction(toggle)
                .addAction(next)
                .addAction(like);

        if (duration > 0) {
            builder.setProgress((int) (duration / 1000), (int) (position / 1000), false);
            builder.setSubText(remaining());
        }

        if (artwork != null) {
            builder.setLargeIcon(artwork);
        }

        return builder.build();
    }

    private String remaining() {
        long left = Math.max(0, duration - position) / 1000;
        return String.format(Locale.US, "%d:%02d", left / 60, left % 60);
    }

    private PendingIntent action(String command) {
        Intent intent = new Intent(this, PlaybackService.class)
                .setAction(ACTION_COMMAND)
                .putExtra("command", command);

        return PendingIntent.getService(
                this,
                command.hashCode(),
                intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void notifyNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, build());
        }
    }

    private void loadArtwork() {
        if (cover.isEmpty() || cover.equals(artworkKey) || executor == null) return;

        artworkKey = cover;
        String target = cover;

        executor.execute(() -> {
            try {
                String address = BASE_URL + "/api/cover?url=" + URLEncoder.encode(target, "UTF-8");
                HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);

                String cookie = CookieManager.getInstance().getCookie(BASE_URL);
                if (cookie != null) {
                    connection.setRequestProperty("Cookie", cookie);
                }

                try (InputStream stream = connection.getInputStream()) {
                    Bitmap bitmap = BitmapFactory.decodeStream(stream);
                    if (bitmap == null) return;

                    artwork = bitmap;
                    updateSession();
                    notifyNotification();
                }
            } catch (Exception ignored) {
                return;
            }
        });
    }

    private void channel() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL) != null) return;

        NotificationChannel created = new NotificationChannel(
                CHANNEL, "Воспроизведение", NotificationManager.IMPORTANCE_LOW);
        created.setShowBadge(false);
        created.setSound(null, null);
        manager.createNotificationChannel(created);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(ticker);

        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }

        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }

        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
