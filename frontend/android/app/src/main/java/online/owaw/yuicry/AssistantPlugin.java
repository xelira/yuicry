package online.owaw.yuicry;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(
        name = "Assistant",
        permissions = {
                @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
        }
)
public class AssistantPlugin extends Plugin {

    private static final String MODEL_URL = "https://get.owaw.online/vosk-model-small-ru.zip";
    private static final String MODEL_DIR = "vosk-model-small-ru";

    private SpeechRecognizer recognizer;
    private volatile PluginCall listeningCall;
    private volatile boolean listening;
    private boolean systemFallback;

    private volatile Model voskModel;
    private volatile Recognizer voskRecognizer;
    private volatile AudioRecord voskRecorder;
    private volatile boolean voskListening;

    private TextToSpeech speech;
    private boolean speechReady;
    private String pendingSpeech;

    @Override
    public void load() {
        speech = new TextToSpeech(getContext(), status -> {
            if (status != TextToSpeech.SUCCESS) return;

            applyLanguage();
            speechReady = true;

            if (pendingSpeech != null) {
                String value = pendingSpeech;
                pendingSpeech = null;
                speech.speak(value, TextToSpeech.QUEUE_FLUSH, null, "yuicry-" + System.nanoTime());
            }
        });
    }

    @PluginMethod
    public void checkMicrophone(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasMicrophone());
        call.resolve(result);
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (hasMicrophone()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("microphone", call, "microphoneCallback");
    }

    @PermissionCallback
    private void microphoneCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasMicrophone());
        call.resolve(result);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (!hasMicrophone()) {
            call.reject("Нет доступа к микрофону", "permission");
            return;
        }

        if (listening) stopRecognizer();

        if (SpeechRecognizer.isRecognitionAvailable(getContext())) {
            startSystem(call);
            return;
        }

        startVosk(call);
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopRecognizer();
            call.resolve();
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.reject("Пустой текст", "empty");
            return;
        }

        if (!speechReady) {
            pendingSpeech = text;
            call.resolve();
            return;
        }

        getActivity().runOnUiThread(() -> {
            speech.stop();
            applyLanguage();
            speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "yuicry-" + System.nanoTime());
            call.resolve();
        });
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        pendingSpeech = null;
        if (speech != null) speech.stop();
        call.resolve();
    }

    private void startSystem(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(listener);
            }

            listeningCall = call;
            listening = true;
            systemFallback = false;

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ru-RU");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

            recognizer.startListening(intent);
        });
    }

    private void startVosk(PluginCall call) {
        listeningCall = call;
        listening = true;
        voskListening = false;
        notifyStatus("Готовлю распознавание…");

        new Thread(() -> {
            try {
                File directory = ensureModel();
                if (!listening) return;

                if (voskModel == null) {
                    notifyStatus("Загружаю модель…");
                    voskModel = new Model(directory.getAbsolutePath());
                }

                if (!listening) return;
                beginVoskAudio();
            } catch (Exception error) {
                fail("Не удалось запустить распознавание речи", "vosk");
            }
        }, "yuicry-vosk-model").start();
    }

    private void beginVoskAudio() {
        int sampleRate = 16000;
        int minimum = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
        );

        if (minimum <= 0) {
            fail("Микрофон недоступен", "audio");
            return;
        }

        AudioRecord recorder = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minimum * 2, sampleRate * 2)
        );

        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
            recorder.release();
            fail("Микрофон недоступен", "audio");
            return;
        }

        Recognizer recognizer;

        try {
            recognizer = new Recognizer(voskModel, sampleRate);
        } catch (IOException error) {
            recorder.release();
            fail("Не удалось запустить распознавание речи", "vosk");
            return;
        }

        voskRecorder = recorder;
        voskRecognizer = recognizer;
        voskListening = true;
        recorder.startRecording();
        notifyStatus("Слушаю…");

        Thread reader = new Thread(() -> {
            short[] buffer = new short[4096];
            long started = System.currentTimeMillis();

            try {
                while (voskListening && System.currentTimeMillis() - started < 30000) {
                    int count = recorder.read(buffer, 0, buffer.length);
                    if (count <= 0) continue;

                    if (recognizer.acceptWaveForm(buffer, count)) {
                        String text = jsonText(recognizer.getResult(), "text");
                        if (!text.isEmpty()) {
                            finish(text);
                            return;
                        }
                    } else {
                        String partial = jsonText(recognizer.getPartialResult(), "partial");
                        if (!partial.isEmpty()) notifyPartial(partial);
                    }
                }

                if (!voskListening) return;

                String text = jsonText(recognizer.getFinalResult(), "text");
                if (text.isEmpty()) fail("Не расслышал, попробуй ещё раз", "empty");
                else finish(text);
            } catch (Exception error) {
                fail("Не получилось распознать речь", "vosk");
            } finally {
                releaseVosk();
            }
        }, "yuicry-vosk");

        reader.start();
    }

    private File ensureModel() throws IOException {
        File directory = new File(getContext().getFilesDir(), MODEL_DIR);
        File marker = new File(directory, "am/final.mdl");

        if (marker.exists()) return directory;

        deleteRecursive(directory);

        if (!directory.mkdirs() && !directory.isDirectory()) {
            throw new IOException("не удалось создать каталог модели");
        }

        notifyStatus("Загружаю распознавание…");

        HttpURLConnection connection = null;

        try {
            connection = (HttpURLConnection) new URL(MODEL_URL).openConnection();
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(60000);
            connection.setRequestProperty("User-Agent", "yuicry/1.5.0");
            connection.connect();

            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new IOException("статус " + connection.getResponseCode());
            }

            int total = connection.getContentLength();
            long read = 0;
            int lastPercent = -1;
            byte[] buffer = new byte[16384];
            String root = directory.getCanonicalPath();

            try (InputStream input = connection.getInputStream();
                 ZipInputStream zip = new ZipInputStream(input)) {
                ZipEntry entry;

                while ((entry = zip.getNextEntry()) != null) {
                    String name = entry.getName();
                    int slash = name.indexOf('/');
                    if (slash >= 0) name = name.substring(slash + 1);
                    if (name.isEmpty()) continue;

                    File target = new File(directory, name);
                    String path = target.getCanonicalPath();

                    if (!path.equals(root) && !path.startsWith(root + File.separator)) {
                        throw new IOException("плохой архив модели");
                    }

                    if (entry.isDirectory()) {
                        target.mkdirs();
                        continue;
                    }

                    File parent = target.getParentFile();
                    if (parent != null) parent.mkdirs();

                    try (OutputStream output = new FileOutputStream(target)) {
                        int count;
                        while ((count = zip.read(buffer)) > 0) {
                            output.write(buffer, 0, count);
                            read += count;
                        }
                    }

                    if (total > 0) {
                        int percent = (int) Math.min(99, read * 100 / total);
                        if (percent / 5 != lastPercent / 5) {
                            lastPercent = percent;
                            notifyStatus("Загружаю распознавание… " + percent + "%");
                        }
                    }
                }
            }

            if (!marker.exists()) throw new IOException("модель не загрузилась");
            return directory;
        } catch (IOException error) {
            deleteRecursive(directory);
            throw error;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;

        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursive(child);
        }

        file.delete();
    }

    private String jsonText(String value, String field) {
        try {
            return new JSONObject(value).optString(field, "").trim();
        } catch (Exception error) {
            return "";
        }
    }

    private void notifyPartial(String text) {
        Activity activity = getActivity();
        if (activity == null) return;

        activity.runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("text", text);
            notifyListeners("partial", result);
        });
    }

    private void notifyStatus(String text) {
        Activity activity = getActivity();
        if (activity == null) return;

        activity.runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("text", text);
            notifyListeners("status", result);
        });
    }

    private void finish(String text) {
        PluginCall call = listeningCall;
        listeningCall = null;
        listening = false;
        voskListening = false;

        if (call == null) return;

        Activity activity = getActivity();
        JSObject result = new JSObject();
        result.put("text", text);

        if (activity == null) {
            call.resolve(result);
            return;
        }

        activity.runOnUiThread(() -> call.resolve(result));
    }

    private void fail(String message, String code) {
        PluginCall call = listeningCall;
        listeningCall = null;
        listening = false;
        voskListening = false;

        if (call == null) return;
        call.reject(message, code);
    }

    private void releaseVosk() {
        voskListening = false;

        AudioRecord recorder = voskRecorder;
        voskRecorder = null;

        if (recorder != null) {
            try {
                if (recorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) recorder.stop();
            } catch (Exception error) {
                // already stopped
            }

            recorder.release();
        }

        Recognizer recognizer = voskRecognizer;
        voskRecognizer = null;

        if (recognizer != null) recognizer.close();
    }

    private void applyLanguage() {
        int result = speech.setLanguage(new Locale("ru", "RU"));

        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            speech.setLanguage(Locale.getDefault());
        }
    }

    private boolean hasMicrophone() {
        return getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void stopRecognizer() {
        listening = false;
        voskListening = false;

        if (voskRecorder != null) {
            try {
                voskRecorder.stop();
            } catch (Exception error) {
                // already stopped
            }
        }

        if (recognizer != null) recognizer.cancel();

        if (listeningCall != null) {
            listeningCall.reject("Запись остановлена", "cancelled");
            listeningCall = null;
        }
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {
        }

        @Override
        public void onBeginningOfSpeech() {
        }

        @Override
        public void onRmsChanged(float rmsdB) {
        }

        @Override
        public void onBufferReceived(byte[] buffer) {
        }

        @Override
        public void onEndOfSpeech() {
        }

        @Override
        public void onError(int error) {
            PluginCall call = listeningCall;

            if (error == SpeechRecognizer.ERROR_CLIENT && call != null && !systemFallback) {
                systemFallback = true;
                listeningCall = null;
                startVosk(call);
                return;
            }

            listening = false;
            listeningCall = null;

            if (call == null) return;

            String message;

            switch (error) {
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                    message = "Нет доступа к микрофону";
                    break;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                    message = "Нет соединения для распознавания";
                    break;
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    message = "Не расслышал, попробуй ещё раз";
                    break;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                    message = "Распознавание занято";
                    break;
                default:
                    message = "Не получилось распознать речь";
                    break;
            }

            call.reject(message, "recognition");
        }

        @Override
        public void onResults(Bundle results) {
            PluginCall call = listeningCall;
            if (call == null) return;

            String text = firstResult(results);
            if (text.isEmpty()) {
                listening = false;
                listeningCall = null;
                call.reject("Не расслышал, попробуй ещё раз", "empty");
                return;
            }

            finish(text);
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            String text = firstResult(partialResults);
            if (text.isEmpty()) return;

            JSObject result = new JSObject();
            result.put("text", text);
            notifyListeners("partial", result);
        }

        @Override
        public void onEvent(int eventType, Bundle params) {
        }
    };

    private String firstResult(Bundle bundle) {
        ArrayList<String> values = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (values == null || values.isEmpty()) return "";

        String value = values.get(0);
        return value == null ? "" : value.trim();
    }
}
