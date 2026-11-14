"use client";

import { useEffect, useRef, useState } from "react";

import AssistantIsland from "@/components/assistant/AssistantIsland";
import AssistantPanel from "@/components/assistant/AssistantPanel";
import { askAssistant, type AssistantAction, type AssistantChatMessage } from "@/lib/assistant";
import { listen, requestMicrophone, speak, stopSpeaking, type ListeningSession } from "@/lib/speech";
import { playWave } from "@/lib/wave";
import { useAssistant } from "@/store/assistantStore";
import { currentTrack, usePlayer, type Track } from "@/store/playerStore";

const voiceKey = "yuicry:assistant-voice";

export default function Assistant() {
  const open = useAssistant((state) => state.open);
  const expanded = useAssistant((state) => state.expanded);
  const messages = useAssistant((state) => state.messages);
  const busy = useAssistant((state) => state.busy);
  const listening = useAssistant((state) => state.listening);
  const voice = useAssistant((state) => state.voice);
  const setOpen = useAssistant((state) => state.setOpen);
  const setExpanded = useAssistant((state) => state.setExpanded);
  const setBusy = useAssistant((state) => state.setBusy);
  const setListening = useAssistant((state) => state.setListening);
  const setVoice = useAssistant((state) => state.setVoice);
  const addMessage = useAssistant((state) => state.addMessage);
  const clear = useAssistant((state) => state.clear);

  const track = usePlayer(currentTrack);

  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const session = useRef<ListeningSession | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(voiceKey);
    if (saved !== null) setVoice(saved === "1");
  }, [setVoice]);

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

  const context = () => {
    const player = usePlayer.getState();
    const current = player.queue[player.index];

    return {
      track: current?.title ?? "",
      artist: current?.artist ?? "",
      playing: player.playing,
      queue: player.queue.length,
      likes: player.liked.length,
    };
  };

  const applyAction = (action: AssistantAction, tracks: Track[]) => {
    const player = usePlayer.getState();

    if (action === "play" && tracks.length > 0) {
      player.playQueue(tracks);
      setExpanded(false);
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

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || useAssistant.getState().busy) return;

    stopSpeaking();
    setError("");
    setStatus("");
    addMessage({ role: "user", text });
    setInput("");
    setBusy(true);

    try {
      const history: AssistantChatMessage[] = useAssistant
        .getState()
        .messages.filter((message) => !message.failed)
        .slice(-8)
        .map((message) => ({ role: message.role, content: message.text }));

      const answer = await askAssistant(history, context());
      addMessage({ role: "assistant", text: answer.reply, tracks: answer.tracks });
      applyAction(answer.action, answer.tracks);

      if (useAssistant.getState().voice && answer.action !== "play" && answer.action !== "wave") {
        void speak(answer.reply);
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Не получилось ответить";
      setError(message);
      addMessage({
        role: "assistant",
        text: "Не получилось ответить. Попробуй ещё раз.",
        failed: true,
      });
    } finally {
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

      if (text.trim()) await send(text);
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
    localStorage.setItem(voiceKey, next ? "1" : "0");
    if (!next) stopSpeaking();
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
        onMic={() => void toggleListen()}
        onExpand={() => setExpanded(true)}
        onHide={() => setOpen(false)}
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
      onInput={setInput}
      onSend={(value) => void send(value)}
      onMic={() => void toggleListen()}
      onVoice={toggleVoice}
      onClear={clearChat}
      onCollapse={() => setExpanded(false)}
      onHide={() => setOpen(false)}
      onPlay={playTrack}
    />
  );
}
