import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameController, UiSnapshot } from '../controller/GameController';
import { SpeechRecognitionManager } from '../voice/SpeechRecognitionManager';

export function useSnapshot(controller: GameController): UiSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export interface VoiceApi { supported: boolean; toggle: () => void; start: () => void; stop: () => void }

/** Connects the browser SpeechRecognition manager to the game controller. */
export function useVoice(controller: GameController): VoiceApi {
  const ref = useRef<SpeechRecognitionManager | null>(null);
  const pausedByTts = useRef(false);
  if (ref.current === null) {
    const s = controller.getSnapshot().settings;
    ref.current = new SpeechRecognitionManager({ lang: s.language, autoRestart: s.handsFree, continuous: true });
  }
  const mgr = ref.current;
  const { language, handsFree } = controller.getSnapshot().settings;

  useEffect(() => {
    mgr.setCallbacks({
      onStart: () => controller.setMic(true),
      onEnd: () => { if (!pausedByTts.current) controller.setMic(false); },
      onInterim: t => controller.setInterim(t),
      onFinal: t => { void controller.submitText(t, 'voice'); },
      onError: (_c, msg) => controller.setMicError(msg)
    });
    controller.feedback.onStart = () => { if (mgr.wanted) { pausedByTts.current = true; mgr.stop(); } };
    controller.feedback.onEnd = () => { if (pausedByTts.current) { pausedByTts.current = false; mgr.start(); } };
    const off = controller.onSystem(c => { if (c === 'STOP_LISTENING') { pausedByTts.current = false; mgr.stop(); } });
    return () => { off(); controller.feedback.onStart = undefined; controller.feedback.onEnd = undefined; };
  }, [controller, mgr]);

  useEffect(() => { mgr.setLanguage(language); mgr.setAutoRestart(handsFree); }, [mgr, language, handsFree]);
  useEffect(() => () => { mgr.stop(); controller.setMic(false); }, [mgr, controller]);

  const start = () => { pausedByTts.current = false; controller.sfx.play('mic'); mgr.start(); };
  const stop = () => { pausedByTts.current = false; mgr.stop(); };
  return { supported: mgr.supported, start, stop, toggle: () => (mgr.wanted ? stop() : start()) };
}
