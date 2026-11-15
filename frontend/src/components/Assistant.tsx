"use client";

import { useEffect, useRef, useState } from "react";

import AssistantIsland from "@/components/assistant/AssistantIsland";
import AssistantPanel from "@/components/assistant/AssistantPanel";
import { askAssistant, type AssistantAction, type AssistantChatMessage } from "@/lib/assistant";
import {
  listen,
  requestMicrophone,
  speak,
  speechSupported,
  stopSpeaking,
  type ListeningSession,
} from "@/lib/speech";
import { pluralRu } from "@/lib/plural";
import { playWave } from "@/lib/wave";
import { useAssistant } from "@/store/assistantStore";
import { currentTrack, usePlayer, type Track } from "@/store/playerStore";

const voiceKey = "yuicry:assistant-voice";
const historyKey = "yuicry:assistant-history-v1";

export default function Assistant() {
  const open = useAssistant((state) => state.open);
  const expanded = useAssistant((state) => state.expanded);
  const messages = useAssistant((state) => state.messages);
  const busy = useAssistant((state) => state.busy);
  const listening = useAssistant((state) => state.listening);
  const voice = useAssistant((state) => state.voice);
  const voiceName = useAssistant((state) => state.voiceName);
  const rate = useAssistant((state) => state.rate);
  const setOpen = useAssistant((state) => state.setOpen);
  const setExpanded = useAssistant((state) => state.setExpanded);
  const setBusy = useAssistant((state) => state.setBusy);
  const setListening = useAssistant((state) => state.setListening);
  const setVoice = useAssistant((state) => state.setVoice);
  const setVoiceName = useAssistant((state) => state.setVoiceName);
  const setRate = useAssistant((state) => state.setRate);
  const addMessage = useAssistant((state) => state.addMessage);
  const clear = useAssistant((state) => state.clear);
  const attachment = useAssistant((state) => state.attachment);
  const detach = useAssistant((state) => state.detach);

  const track = usePlayer(currentTrack);
  const available = speechSupported();

  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const session = useRef<ListeningSession | null>(null);
  const stopped = useRef(false);
  const request = useRef<AbortController | null>(null);
  const restored = useRef(false);
  const savedOnce = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(historyKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const messages = parsed.filter(
            (message) =>
              message &&
              (message.role === "user" || message.role === "assistant") &&
              typeof message.id === "string" &&
              typeof message.text === "string",
          );
          useAssistant.getState().restore(messages);
        }
      }
    } catch (error) {
      // ignore broken history
    }

    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;

    if (!savedOnce.current) {
      savedOnce.current = true;
      return;
    }

    try {
      localStorage.setItem(historyKey, JSON.stringify(messages.slice(-40)));
    } catch (error) {
      return;
    }
  }, [messages]);

  useEffect(() => {
    const saved = localStorage.getItem(voiceKey);
    if (saved !== null) setVoice(saved === "1");

    const savedName = localStorage.getItem("yuicry:assistant-voice-name");
    if (savedName === "svetlana" || savedName === "dmitry") setVoiceName(savedName);

    const savedRate = Number(localStorage.getItem("yuicry:assistant-rate"));
    if (savedRate >= 0.8 && savedRate <= 1.2) setRate(savedRate);
  }, [setVoice, setVoiceName, setRate]);

  useEffect(() => {
    if (!error) return;

    const timer = window.setTimeout(() => setError(""), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (expanded) {
        setExpanded(false);
        return;
      }

      setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, expanded, setExpanded, setOpen]);

  useEffect(() => {
    if (open) return;

    stopped.current = true;
    session.current?.stop();
    session.current = null;
    setListening(false);
    setStatus("");
    stopSpeaking();
  }, [open, setListening]);

  const context = (voice = false) => {
    const player = usePlayer.getState();
    const current = player.queue[player.index];
    const state = useAssistant.getState();
    const lastWithTracks = [...state.messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.tracks?.length);

    return {
      track: current?.title ?? "",
      artist: current?.artist ?? "",
      playing: player.playing,
      queue: player.queue.length,
      likes: player.liked.length,
      last_tracks:
        lastWithTracks?.tracks?.map((item) => `${item.title} — ${item.artist}`) ?? [],
      attachment: state.attachment
        ? {
            kind: state.attachment.kind,
            id: state.attachment.id,
            title: state.attachment.title,
            artist: state.attachment.artist,
            count: state.attachment.count,
          }
        : null,
      queue_tracks: player.queue.slice(0, 30),
      queue_index: player.index,
      voice,
    };
  };

  const applyAction = (action: AssistantAction, tracks: Track[], index = 0) => {
    const player = usePlayer.getState();

    if (action === "play" && tracks.length > 0) {
      player.playQueue(tracks);
      setExpanded(false);
      return;
    }

    if (action === "play_likes" && tracks.length > 0) {
      player.playQueue(tracks);
      setExpanded(false);
      return;
    }

    if (action === "show_likes" && tracks.length > 0) {
      setExpanded(true);
      return;
    }

    if (action === "play_index") {
      const state = useAssistant.getState();
      const lastWithTracks = [...state.messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.tracks?.length);
      const source = lastWithTracks?.tracks ?? player.queue;
      const position = index - 1;

      if (position >= 0 && position < source.length) {
        player.playQueue(source, position);
        setExpanded(false);
      }

      return;
    }

    if (action === "queue_next" && tracks.length > 0) {
      player.queueNext(tracks);
      return;
    }

    if (action === "remove_current") {
      player.removeCurrent();
      return;
    }

    if (action === "repeat") {
      player.repeatCurrent();
      return;
    }

    if (action === "shuffle") {
      player.shuffleQueue();
      return;
    }

    if (action === "queue_saved") {
      window.dispatchEvent(new Event("yuicry:albums-changed"));
      return;
    }

    if (action === "wave") {
      void playWave().then((started) => {
        if (started) setExpanded(false);
      });
      return;
    }

    if (action === "pause") {
      player.setPlaying(false);
      return;
    }

    if (action === "resume") {
      player.setPlaying(true);
      return;
    }

    if (action === "next") {
      player.next();
      return;
    }

    if (action === "previous") {
      player.previous();
      return;
    }

    if (action === "like") {
      const current = player.queue[player.index];
      if (current && !player.likes[current.id]) void player.toggleLike(current);
    }
  };

  const stopGeneration = () => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    stopSpeaking();
  };

  const send = async (raw?: string, fromVoice = false) => {
    const text = (raw ?? input).trim();
    if (!text || useAssistant.getState().busy) return;

    stopSpeaking();
    setError("");
    setStatus("");

    const pending = useAssistant.getState().attachment;
    addMessage({ role: "user", text, attachment: pending ?? undefined });
    setInput("");

    const requestContext = context(fromVoice);
    detach();
    setBusy(true);

    const controller = new AbortController();
    request.current = controller;

    try {
      const history: AssistantChatMessage[] = useAssistant
        .getState()
        .messages.filter((message) => !message.failed)
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: message.attachment
            ? `${attachmentLabel(message.attachment)}\n${message.text}`
            : message.text,
        }));

      const answer = await askAssistant(history, requestContext, controller.signal);
      addMessage({
        role: "assistant",
        text: answer.reply,
        tracks: answer.tracks,
        sources: answer.sources,
        suggestion: answer.suggestion || undefined,
      });
      applyAction(answer.action, answer.tracks, answer.index);

      if (
        useAssistant.getState().voice &&
        answer.action !== "play" &&
        answer.action !== "wave" &&
        answer.action !== "play_likes" &&
        answer.action !== "play_index"
      ) {
        void speak(answer.reply, { voice: voiceName, rate });
      }
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") {
        addMessage({ role: "assistant", text: "Остановлено.", failed: true });
      } else {
        const message = failure instanceof Error ? failure.message : "Не получилось ответить";
        setError(message);
        addMessage({
          role: "assistant",
          text: "Не получилось ответить. Попробуй ещё раз.",
          failed: true,
        });
      }
    } finally {
      if (request.current === controller) request.current = null;
      setBusy(false);
    }
  };

  const retry = async () => {
    const state = useAssistant.getState();
    const messagesList = state.messages;
    let assistantIndex = -1;

    for (let index = messagesList.length - 1; index >= 0; index -= 1) {
      if (messagesList[index].role === "assistant") {
        assistantIndex = index;
        break;
      }
    }

    if (assistantIndex < 0) return;

    let userIndex = -1;
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      if (messagesList[index].role === "user") {
        userIndex = index;
        break;
      }
    }

    if (userIndex < 0) return;

    const history: AssistantChatMessage[] = messagesList
      .slice(0, userIndex + 1)
      .filter((message) => !message.failed)
      .slice(-8)
      .map((message) => ({
        role: message.role,
        content: message.attachment
          ? `${attachmentLabel(message.attachment)}\n${message.text}`
          : message.text,
      }));

    const requestContext = context(false);
    state.truncate(userIndex + 1);
    setBusy(true);

    const controller = new AbortController();
    request.current = controller;

    try {
      const answer = await askAssistant(history, requestContext, controller.signal);
      addMessage({
        role: "assistant",
        text: answer.reply,
        tracks: answer.tracks,
        sources: answer.sources,
        suggestion: answer.suggestion || undefined,
      });
      applyAction(answer.action, answer.tracks, answer.index);

      if (
        useAssistant.getState().voice &&
        answer.action !== "play" &&
        answer.action !== "wave" &&
        answer.action !== "play_likes" &&
        answer.action !== "play_index"
      ) {
        void speak(answer.reply, { voice: voiceName, rate });
      }
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError")) {
        setError(failure instanceof Error ? failure.message : "Не получилось ответить");
      }
    } finally {
      if (request.current === controller) request.current = null;
      setBusy(false);
    }
  };

  const toggleListen = async () => {
    if (listening) {
      stopped.current = true;
      session.current?.stop();
      session.current = null;
      setListening(false);
      setStatus("");
      return;
    }

    if (useAssistant.getState().busy) return;

    setError("");
    setStatus("");

    const granted = await requestMicrophone();
    if (!granted) {
      setError("Разреши доступ к микрофону");
      return;
    }

    stopSpeaking();
    stopped.current = false;
    setListening(true);

    try {
      const current = listen(
        (text) => setInput(text),
        (text) => setStatus(text),
      );

      session.current = current;
      const text = await current.result;
      session.current = null;
      setListening(false);
      setStatus("");
      setInput("");

      if (text.trim() && useAssistant.getState().open) await send(text, true);
    } catch (failure) {
      session.current = null;
      setListening(false);
      setStatus("");

      if (!stopped.current) {
        setError(failure instanceof Error ? failure.message : "Не получилось распознать речь");
      }
    }
  };

  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    if (!next) stopSpeaking();
  };

  const attachmentLabel = (value: NonNullable<ReturnType<typeof useAssistant.getState>["attachment"]>) => {
    if (value.kind === "track") {
      return `[Вложение: трек «${value.title}» — ${value.artist ?? "неизвестен"}]`;
    }

    return `[Вложение: плейлист «${value.title}» (${value.count ?? 0} ${pluralRu(value.count ?? 0, "трек", "трека", "треков")})]`;
  };

  const playTrack = (tracks: Track[], index: number) => {
    usePlayer.getState().playQueue(tracks, index);
    setExpanded(false);
  };

  const clearChat = () => {
    stopSpeaking();
    clear();
    setError("");
    setStatus("");
  };

  if (!open) return null;

  const last = [...messages].reverse().find((message) => message.role === "assistant") ?? null;

  if (!expanded) {
    return (
      <AssistantIsland
        busy={busy}
        listening={listening}
        status={status}
        error={error}
        last={last}
        track={track ?? null}
        attachment={attachment}
        available={available}
        onMic={() => void toggleListen()}
        onExpand={() => setExpanded(true)}
        onHide={() => setOpen(false)}
        onStop={stopGeneration}
      />
    );
  }

  return (
    <AssistantPanel
      messages={messages}
      busy={busy}
      listening={listening}
      voice={voice}
      input={input}
      error={error}
      status={status}
      track={track ?? null}
      attachment={attachment}
      available={available}
      onDetach={detach}
      onInput={setInput}
      onSend={(value) => void send(value)}
      onMic={() => void toggleListen()}
      onVoice={toggleVoice}
      onClear={clearChat}
      onCollapse={() => setExpanded(false)}
      onHide={() => setOpen(false)}
      onPlay={playTrack}
      onSuggestion={(value) => void send(value, false)}
      onStop={stopGeneration}
      onRetry={() => void retry()}
    />
  );
}
