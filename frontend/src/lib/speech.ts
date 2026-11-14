import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeAssistant = {
  checkMicrophone: () => Promise<{ granted: boolean }>;
  requestMicrophone: () => Promise<{ granted: boolean }>;
  startListening: () => Promise<{ text: string }>;
  stopListening: () => Promise<void>;
  speak: (options: { text: string }) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  addListener: (
    event: "partial" | "status",
    handler: (data: { text: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

type RecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: RecognitionResult;
  };
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionConstructor = new () => Recognition;

const native = registerPlugin<NativeAssistant>("Assistant");

export type ListeningSession = {
  result: Promise<string>;
  stop: () => void;
};

export function nativeSpeech() {
  return Capacitor.isNativePlatform();
}

export function speechSupported() {
  if (typeof window === "undefined") return false;
  if (nativeSpeech()) return true;

  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };

  return Boolean(scope.SpeechRecognition || scope.webkitSpeechRecognition);
}

export function ttsSupported() {
  if (typeof window === "undefined") return false;
  if (nativeSpeech()) return true;
  return "speechSynthesis" in window;
}

export async function requestMicrophone() {
  if (nativeSpeech()) {
    try {
      const result = await native.requestMicrophone();
      return Boolean(result.granted);
    } catch (error) {
      return false;
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) return false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    return false;
  }
}

export function listen(
  onPartial: (text: string) => void,
  onStatus?: (text: string) => void,
): ListeningSession {
  if (nativeSpeech()) {
    let stopped = false;
    let partialListener: { remove: () => Promise<void> } | null = null;
    let statusListener: { remove: () => Promise<void> } | null = null;

    const result = (async () => {
      partialListener = await native.addListener("partial", (data) => {
        if (!stopped) onPartial(data.text);
      });

      if (onStatus) {
        statusListener = await native.addListener("status", (data) => {
          if (!stopped) onStatus(data.text);
        });
      }

      try {
        const value = await native.startListening();
        return value.text;
      } finally {
        if (partialListener) await partialListener.remove();
        if (statusListener) await statusListener.remove();
      }
    })();

    return {
      result,
      stop: () => {
        stopped = true;
        void native.stopListening().catch(() => undefined);
      },
    };
  }

  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };

  const Constructor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Constructor) throw new Error("Распознавание речи недоступно");

  const recognition = new Constructor();
  let finalText = "";
  let settled = false;

  const result = new Promise<string>((resolve, reject) => {
    recognition.lang = "ru-RU";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const item = event.results[index];
        if (item.isFinal) finalText += item[0].transcript;
        else interim += item[0].transcript;
      }

      onPartial(`${finalText}${interim}`.trim());
    };

    recognition.onerror = (event) => {
      if (settled) return;
      settled = true;
      reject(new Error(errorText(event.error)));
    };

    recognition.onend = () => {
      if (settled) return;
      settled = true;

      const text = finalText.trim();
      if (text) resolve(text);
      else reject(new Error("Не расслышал, попробуй ещё раз"));
    };

    recognition.start();
  });

  return {
    result,
    stop: () => recognition.stop(),
  };
}

export async function speak(text: string) {
  const value = text.trim();
  if (!value) return;

  if (nativeSpeech()) {
    await native.speak({ text: value }).catch(() => undefined);
    return;
  }

  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = "ru-RU";
  utterance.rate = 1.03;

  const voice = window.speechSynthesis
    .getVoices()
    .find((item) => item.lang.toLowerCase().startsWith("ru"));

  if (voice) utterance.voice = voice;

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (nativeSpeech()) {
    void native.stopSpeaking().catch(() => undefined);
    return;
  }

  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function errorText(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") return "Разреши доступ к микрофону";
  if (error === "no-speech") return "Не расслышал, попробуй ещё раз";
  if (error === "network") return "Нет соединения для распознавания";
  return "Не получилось распознать речь";
}
