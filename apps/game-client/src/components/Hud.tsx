import { ITEMS, xpToNext } from '@dungeon/game-core';
import type { GameState } from '@dungeon/shared';

function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: 'hp' | 'xp' }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`bar bar-${kind}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span className="bar-label">{label}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${pct}%` }} /></span>
      <span className="bar-num">{value}/{max}</span>
    </div>
  );
}

export function Hud({ state }: { state: GameState }) {
  const p = state.player;
  const weapon = p.equipped.weapon ? ITEMS[p.equipped.weapon].name : 'Fists';
  const armor = p.equipped.armor ? ITEMS[p.equipped.armor].name : 'None';
  return (
    <div className="hud" aria-label="Player status">
      <div className="hud-title"><span className="hud-lv">LV {p.level}</span> <span>Wanderer</span></div>
      <Bar label="HP" value={p.health} max={p.maxHealth} kind="hp" />
      <Bar label="XP" value={p.xp} max={xpToNext(p.level)} kind="xp" />
      <div className="hud-row"><span className="gold">◆ {p.gold}</span><span title="Weapon">⚔ {weapon}</span><span title="Armor">⛨ {armor}</span></div>
    </div>
  );
}
