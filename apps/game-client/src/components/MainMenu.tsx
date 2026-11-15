const EMBERS = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 37) % 100}%`, delay: `${(i * 0.9) % 9}s`, dur: `${7 + ((i * 5) % 7)}s`, size: 2 + (i % 3)
}));

export type MenuAction = 'new' | 'continue' | 'how' | 'voice' | 'settings' | 'credits';

export function MainMenu({ hasSave, onSelect }: { hasSave: boolean; onSelect: (a: MenuAction) => void }) {
  const items: { id: MenuAction; label: string; disabled?: boolean; primary?: boolean }[] = [
    { id: 'new', label: 'Start New Game', primary: true },
    { id: 'continue', label: 'Continue Game', disabled: !hasSave },
    { id: 'how', label: 'How to Play' },
    { id: 'voice', label: 'Voice Command Guide' },
    { id: 'settings', label: 'Settings' },
    { id: 'credits', label: 'Credits' }
  ];
  return (
    <main className="menu" aria-label="Main menu">
      <div className="menu-bg" aria-hidden="true">
        <div className="arch" />
        <div className="torch torch-l"><i /></div>
        <div className="torch torch-r"><i /></div>
        {EMBERS.map((e, i) => <span key={i} className="ember" style={{ left: e.left, animationDelay: e.delay, animationDuration: e.dur, width: e.size, height: e.size }} />)}
      </div>
      <div className="menu-card">
        <p className="eyebrow">A voice-controlled adventure</p>
        <h1 className="logo">Echoes<br /><span>of the Crypt</span></h1>
        <nav className="menu-list">
          {items.map(i => (
            <button key={i.id} type="button" className={`menu-btn ${i.primary ? 'primary' : ''}`} disabled={i.disabled} onClick={() => onSelect(i.id)}>
              <span className="caret" aria-hidden="true">▶</span>{i.label}
            </button>
          ))}
        </nav>
        <p className="menu-foot">Say <b>“move north”</b> · <b>“attack the goblin”</b> · <b>“open the chest”</b></p>
      </div>
    </main>
  );
}
