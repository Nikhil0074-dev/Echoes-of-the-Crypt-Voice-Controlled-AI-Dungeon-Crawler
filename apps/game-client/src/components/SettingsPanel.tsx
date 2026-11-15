import type { GameController, UiSnapshot } from '../controller/GameController';
import type { VoiceApi } from './hooks';

const LANGS: [string, string][] = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)'], ['en-AU', 'English (Australia)'],
  ['es-ES', 'Español *'], ['fr-FR', 'Français *'], ['de-DE', 'Deutsch *'], ['hi-IN', 'हिन्दी *']
];

export function SettingsPanel({ controller, snap, voice }: { controller: GameController; snap: UiSnapshot; voice: Pick<VoiceApi, 'supported'> }) {
  const s = snap.settings;
  const set = controller.updateSettings.bind(controller);
  return (
    <div className="settings">
      <label className="row"><span>Sound effects</span><input type="checkbox" checked={s.sound} onChange={e => set({ sound: e.target.checked })} /></label>
      <label className="row"><span>Spoken replies (text-to-speech){!controller.feedback.supported && <em className="muted"> unavailable</em>}</span>
        <input type="checkbox" checked={s.tts} disabled={!controller.feedback.supported} onChange={e => set({ tts: e.target.checked })} /></label>
      <label className="row"><span>Hands-free listening (auto-restart){!voice.supported && <em className="muted"> unavailable</em>}</span>
        <input type="checkbox" checked={s.handsFree} disabled={!voice.supported} onChange={e => set({ handsFree: e.target.checked })} /></label>
      <label className="row"><span>Suggested commands</span><input type="checkbox" checked={s.showHints} onChange={e => set({ showHints: e.target.checked })} /></label>
      <label className="row"><span>Recognition language</span>
        <select value={s.language} onChange={e => set({ language: e.target.value })}>
          {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></label>
      <label className="row"><span>Command interpreter</span>
        <select value={s.aiMode} onChange={e => set({ aiMode: e.target.value === 'server' ? 'server' : 'local' })}>
          <option value="local">Local rules (offline)</option>
          <option value="server">Server AI (falls back to local)</option>
        </select></label>
      <p className="muted small">* The built-in parser understands English. Other languages work only with Server AI and an API key configured.</p>
    </div>
  );
}
