package online.owaw.yuicry;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
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

import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
        name = "Assistant",
        permissions = {
                @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
        }
)
public class AssistantPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private PluginCall listeningCall;
    private TextToSpeech speech;
    private boolean speechReady;
    private boolean listening;

    @Override
    public void load() {
        speech = new TextToSpeech(getContext(), status -> {
            if (status != TextToSpeech.SUCCESS) return;

            applyLanguage();
            speechReady = true;
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

        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Распознавание речи недоступно", "unavailable");
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (listening) stopRecognizer();

            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(listener);
            }

            listeningCall = call;
            listening = true;

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ru-RU");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

            recognizer.startListening(intent);
        });
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
            call.reject("Озвучка ещё не готова", "unavailable");
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
        if (speech != null) speech.stop();
        call.resolve();
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

        if (recognizer != null) recognizer.cancel();

        if (listeningCall != null) {
            listeningCall.reject("Запись остановлена", "cancelled");
            listeningCall = null;
        }
    }

    private void finish(PluginCall call, String text) {
        listening = false;
        listeningCall = null;

        JSObject result = new JSObject();
        result.put("text", text);
        call.resolve(result);
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

            finish(call, text);
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
