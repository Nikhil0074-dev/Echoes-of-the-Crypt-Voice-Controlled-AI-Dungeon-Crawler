import { useState } from 'react';
import { GameController } from './controller/GameController';
import { loadSettings } from './persistence/settings';
import { GameScreen, type ModalKind } from './components/GameScreen';
import { Credits, HowToPlay, VoiceGuide } from './components/Guides';
import { MainMenu, type MenuAction } from './components/MainMenu';
import { Modal } from './components/Modal';
import { SettingsPanel } from './components/SettingsPanel';
import { useSnapshot } from './components/hooks';
import { getRecognitionCtor } from './voice/SpeechRecognitionManager';

export default function App() {
  const [controller] = useState(() => new GameController({ settings: loadSettings() }));
  const snap = useSnapshot(controller);
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [modal, setModal] = useState<Exclude<ModalKind, null> | null>(null);
  const [saveTick, setSaveTick] = useState(0);
  void saveTick;

  const select = (a: MenuAction) => {
    if (a === 'new') { controller.newGame(); setScreen('game'); }
    else if (a === 'continue') { if (controller.loadGame()) setScreen('game'); }
    else setModal(a);
  };

  if (screen === 'game') {
    return <GameScreen controller={controller} onMenu={() => { setScreen('menu'); setSaveTick(t => t + 1); }} />;
  }
  return (
    <>
      <MainMenu hasSave={controller.hasSave()} onSelect={select} />
      {modal && (
        <Modal title={{ how: 'How to Play', voice: 'Voice Command Guide', settings: 'Settings', credits: 'Credits' }[modal]} onClose={() => setModal(null)}>
          {modal === 'how' && <HowToPlay />}
          {modal === 'voice' && <VoiceGuide />}
          {modal === 'settings' && <SettingsPanel controller={controller} snap={snap} voice={{ supported: getRecognitionCtor() !== null }} />}
          {modal === 'credits' && <Credits />}
        </Modal>
      )}
    </>
  );
}
