import { useEffect, useRef, useState } from 'react';
import { ITEMS } from '@dungeon/game-core';
import type { LogEntry } from '../controller/GameController';
import type { GameState } from '@dungeon/shared';

type Tab = 'quest' | 'pack' | 'log';

export function SidePanel({ state, log }: { state: GameState; log: LogEntry[] }) {
  const [tab, setTab] = useState<Tab>('quest');
  const logRef = useRef<HTMLUListElement>(null);
  useEffect(() => { if (tab === 'log' && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, tab]);
  const next = state.objectives.find(o => !o.done);
  const p = state.player;

  return (
    <aside className="side panel" aria-label="Game information">
      <div className="tabs" role="tablist">
        {(['quest', 'pack', 'log'] as Tab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab on' : 'tab'} onClick={() => setTab(t)}>
            {t === 'quest' ? 'Quests' : t === 'pack' ? 'Pack' : 'Log'}
          </button>
        ))}
      </div>

      {tab === 'quest' && (
        <div className="tabpane" role="tabpanel">
          <h3 className="pane-title">{state.name}</h3>
          <ul className="quests">
            {state.objectives.map(o => (
              <li key={o.id} className={o.done ? 'q done' : o === next ? 'q next' : 'q'}>
                <span className="q-box" aria-hidden="true">{o.done ? '✔' : o === next ? '▶' : '·'}</span>
                <span>{o.text}</span>
              </li>
            ))}
          </ul>
          {next && <p className="hint"><b>Hint:</b> {next.hint}</p>}
          {!next && <p className="hint good">Every objective complete!</p>}
        </div>
      )}

      {tab === 'pack' && (
        <div className="tabpane" role="tabpanel">
          <ul className="pack">
            {p.inventory.length === 0 && <li className="muted">Your pack is empty.</li>}
            {p.inventory.map(i => {
              const eq = p.equipped.weapon === i.id || p.equipped.armor === i.id;
              const d = ITEMS[i.id];
              return (
                <li key={i.id} className="pack-item">
                  <span className="pack-name">{d.name}{eq && <em className="eq"> equipped</em>}</span>
                  <span className="pack-qty">×{i.quantity}</span>
                  <span className="pack-desc">{d.kind === 'consumable' ? `Heals ${d.heal}` : d.kind === 'weapon' ? `+${d.attackBonus} attack` : d.kind === 'armor' ? `+${d.defenseBonus} defense` : 'Opens a locked door'}</span>
                </li>
              );
            })}
          </ul>
          <div className="stats">
            <span>ATK {p.attack + (p.equipped.weapon ? ITEMS[p.equipped.weapon].attackBonus ?? 0 : 0)}</span>
            <span>DEF {p.defense + (p.equipped.armor ? ITEMS[p.equipped.armor].defenseBonus ?? 0 : 0)}</span>
            <span>TURN {state.turn}</span>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <ul className="log" ref={logRef} aria-live="polite" aria-label="Event log">
          {log.length === 0 && <li className="muted">Nothing has happened yet.</li>}
          {log.map(l => <li key={l.id} className={`log-${l.tone}`}>{l.text}</li>)}
        </ul>
      )}
    </aside>
  );
}
