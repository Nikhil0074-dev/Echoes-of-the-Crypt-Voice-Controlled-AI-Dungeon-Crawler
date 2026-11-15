import { useEffect, useState } from 'react';
import type { Action } from '@dungeon/shared';
import type { GameController } from '../controller/GameController';
import { Hud } from './Hud';
import { Modal } from './Modal';
import { Credits, HowToPlay, VoiceGuide } from './Guides';
import { SettingsPanel } from './SettingsPanel';
import { SidePanel } from './SidePanel';
import { Stage } from './Stage';
import { VoiceConsole } from './VoiceConsole';
import { useSnapshot, useVoice } from './hooks';

export type ModalKind = 'how' | 'voice' | 'settings' | 'credits' | null;
const TITLES: Record<Exclude<ModalKind, null>, string> = { how: 'How to Play', voice: 'Voice Command Guide', settings: 'Settings', credits: 'Credits' };

export const KEYMAP: Record<string, { actions: Action[]; label: string }> = {
  ArrowUp: { actions: [{ type: 'MOVE', direction: 'NORTH', distance: 1 }], label: 'Move north' },
  w: { actions: [{ type: 'MOVE', direction: 'NORTH', distance: 1 }], label: 'Move north' },
  ArrowDown: { actions: [{ type: 'MOVE', direction: 'SOUTH', distance: 1 }], label: 'Move south' },
  s: { actions: [{ type: 'MOVE', direction: 'SOUTH', distance: 1 }], label: 'Move south' },
  ArrowLeft: { actions: [{ type: 'MOVE', direction: 'WEST', distance: 1 }], label: 'Move west' },
  a: { actions: [{ type: 'MOVE', direction: 'WEST', distance: 1 }], label: 'Move west' },
  ArrowRight: { actions: [{ type: 'MOVE', direction: 'EAST', distance: 1 }], label: 'Move east' },
  d: { actions: [{ type: 'MOVE', direction: 'EAST', distance: 1 }], label: 'Move east' },
  ' ': { actions: [{ type: 'ATTACK' }], label: 'Attack' },
  e: { actions: [{ type: 'INTERACT' }], label: 'Interact' },
  f: { actions: [{ type: 'COLLECT' }], label: 'Pick up' },
  q: { actions: [{ type: 'USE_ITEM', item: 'health_potion' }], label: 'Use health potion' }
};

export function GameScreen({ controller, onMenu, initialModal = null }: { controller: GameController; onMenu: () => void; initialModal?: ModalKind }) {
  const snap = useSnapshot(controller);
  const voice = useVoice(controller);
  const [modal, setModal] = useState<ModalKind>(initialModal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || modal) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'm') { e.preventDefault(); voice.toggle(); return; }
      if (key === 'p' || key === 'Escape') { e.preventDefault(); controller.setPaused(!controller.getSnapshot().paused); return; }
      const m = KEYMAP[key];
      if (m) { e.preventDefault(); controller.runActions(m.actions, m.label); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, voice, modal]);

  useEffect(() => {
    if (snap.modalRequest === 'settings') { setModal('settings'); controller.clearModalRequest(); }
    if (snap.modalRequest === 'help') { setModal('voice'); controller.clearModalRequest(); }
  }, [snap.modalRequest, controller]);

  const over = snap.state.status !== 'PLAYING';

  return (
    <div className="game">
      <header className="topbar">
        <button type="button" className="btn small ghost" onClick={onMenu}>☰ Menu</button>
        <div className="top-title">{snap.state.name}</div>
        <div className="top-actions">
          <button type="button" className="btn small ghost" onClick={() => controller.setPaused(!snap.paused)} aria-pressed={snap.paused}>{snap.paused ? '▶ Resume' : '⏸ Pause'}</button>
          <button type="button" className="btn small ghost" onClick={() => controller.updateSettings({ sound: !snap.settings.sound })} aria-pressed={!snap.settings.sound}>{snap.settings.sound ? '🔊' : '🔇'}</button>
          <button type="button" className="btn small ghost" onClick={() => controller.saveGame()}>💾 Save</button>
          <button type="button" className="btn small ghost" onClick={() => setModal('voice')}>? Help</button>
        </div>
      </header>

      <div className="layout">
        <div className="main-col">
          <div className="stage panel">
            <Stage controller={controller} />
            <Hud state={snap.state} />
            {snap.paused && <div className="overlay"><div className="overlay-card"><h2>Paused</h2><p>Say “resume” or press P.</p></div></div>}
            {over && (
              <div className="overlay">
                <div className="overlay-card">
                  <h2 className={snap.state.status === 'WON' ? 'win' : 'lose'}>{snap.state.status === 'WON' ? 'You Escaped!' : 'You Died'}</h2>
                  <p>Level {snap.state.player.level} · {snap.state.player.gold} gold · {snap.state.turn} turns</p>
                  <div className="overlay-actions">
                    <button type="button" className="btn" onClick={() => controller.newGame()}>Try Again</button>
                    <button type="button" className="btn ghost" onClick={onMenu}>Main Menu</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <VoiceConsole controller={controller} snap={snap} voice={voice} />
        </div>
        <SidePanel state={snap.state} log={snap.log} />
      </div>

      {modal && (
        <Modal title={TITLES[modal]} onClose={() => setModal(null)}>
          {modal === 'how' && <HowToPlay />}
          {modal === 'voice' && <VoiceGuide />}
          {modal === 'settings' && <SettingsPanel controller={controller} snap={snap} voice={voice} />}
          {modal === 'credits' && <Credits />}
        </Modal>
      )}
    </div>
  );
}
