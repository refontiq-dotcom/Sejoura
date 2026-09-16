"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOUND_PREF_KEY = "sejoura:notification-sound";
const SOUND_SRC = "/sounds/notification.wav";

function readSoundPreference(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SOUND_PREF_KEY) !== "off";
}

export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [enabled, setEnabledState] = useState<boolean>(readSoundPreference);
  const enabledRef = useRef(enabled);

  const setEnabled = useCallback((value: boolean) => {
    enabledRef.current = value;
    setEnabledState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SOUND_PREF_KEY, value ? "on" : "off");
    }
  }, []);

  const getAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const audio = new Audio(SOUND_SRC);
      audio.preload = "auto";
      audio.volume = 0.6;
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  // Les navigateurs bloquent la lecture automatique tant qu'aucune interaction
  // utilisateur n'a eu lieu : on "déverrouille" l'audio au premier geste.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlock = () => {
      const audio = getAudio();
      if (audio) {
        audio.muted = true;
        audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
          })
          .catch(() => {})
          .finally(() => {
            audio.muted = false;
          });
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [getAudio]);

  const play = useCallback(() => {
    if (!enabledRef.current) return;
    const audio = getAudio();
    if (!audio) return;
    try {
      audio.currentTime = 0;
    } catch {
      // Ignore si le média n'est pas encore prêt.
    }
    audio.play().catch(() => {
      // Lecture bloquée (politique d'autoplay) : ignoré silencieusement.
    });
  }, [getAudio]);

  return { enabled, setEnabled, play };
}
