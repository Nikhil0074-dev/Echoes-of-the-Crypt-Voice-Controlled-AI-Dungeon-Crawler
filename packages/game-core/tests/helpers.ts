import type { Action, GameState } from '@dungeon/shared';
import { executeActions, parseLevel } from '../src';

export const level = (rows: string[]): GameState => parseLevel({ id: 't', name: 'Test', rows });
export const run = (s: GameState, ...actions: Action[]) => executeActions(s, actions);
export const revealAll = (s: GameState): GameState => {
  s.explored = s.explored.map(r => r.map(() => true));
  return s;
};
