export interface Settings {
  aiMode: 'local' | 'server';
  language: string;
  tts: boolean;
  sound: boolean;
  handsFree: boolean;
  showHints: boolean;
}
export const DEFAULT_SETTINGS: Settings = { aiMode: 'local', language: 'en-US', tts: false, sound: true, handsFree: false, showHints: true };
const KEY = 'vdc.settings.v1';

export function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      aiMode: p.aiMode === 'server' ? 'server' : 'local',
      language: typeof p.language === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(p.language) ? p.language : DEFAULT_SETTINGS.language,
      tts: p.tts === true, sound: p.sound !== false, handsFree: p.handsFree === true, showHints: p.showHints !== false
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try { if (!storage) return false; storage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}
