import type { EnemyKind, ItemId } from '@dungeon/shared';

export interface ItemDef {
  id: ItemId;
  name: string;
  kind: 'consumable' | 'weapon' | 'armor' | 'key';
  heal?: number;
  attackBonus?: number;
  defenseBonus?: number;
  aliases: string[];
}

export const ITEMS: Record<ItemId, ItemDef> = {
  health_potion: { id: 'health_potion', name: 'Health Potion', kind: 'consumable', heal: 40, aliases: ['potion', 'health potion', 'healing potion', 'elixir', 'health', 'heal'] },
  iron_sword: { id: 'iron_sword', name: 'Iron Sword', kind: 'weapon', attackBonus: 4, aliases: ['sword', 'iron sword', 'weapon', 'blade'] },
  wooden_shield: { id: 'wooden_shield', name: 'Wooden Shield', kind: 'armor', defenseBonus: 2, aliases: ['shield', 'wooden shield', 'armor', 'armour'] },
  dungeon_key: { id: 'dungeon_key', name: 'Dungeon Key', kind: 'key', aliases: ['key', 'dungeon key', 'golden key', 'keys'] }
};

export function resolveItemId(text: string | undefined): ItemId | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().replace(/_/g, ' ').trim();
  for (const def of Object.values(ITEMS)) {
    if (def.id.replace(/_/g, ' ') === t || def.aliases.includes(t)) return def.id;
  }
  for (const def of Object.values(ITEMS)) {
    if (def.aliases.some(a => t.includes(a))) return def.id;
  }
  return undefined;
}

export interface EnemyTemplate {
  kind: EnemyKind; name: string; health: number; attack: number; defense: number;
  xp: number; gold: number; aggroRange: number;
}
export const ENEMY_TEMPLATES: Record<EnemyKind, EnemyTemplate> = {
  goblin: { kind: 'goblin', name: 'Goblin', health: 20, attack: 6, defense: 1, xp: 20, gold: 10, aggroRange: 5 },
  skeleton: { kind: 'skeleton', name: 'Skeleton Guardian', health: 35, attack: 9, defense: 3, xp: 50, gold: 25, aggroRange: 5 }
};

export const PLAYER_BASE = { health: 100, attack: 10, defense: 2 } as const;
export const VIEW_RADIUS = 5.5;
export const TRAP_DAMAGE = 10;
export const xpToNext = (level: number): number => level * 50;
