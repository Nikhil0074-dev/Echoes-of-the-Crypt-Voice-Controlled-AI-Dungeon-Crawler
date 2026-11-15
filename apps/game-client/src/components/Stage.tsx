import { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import type { GameController } from '../controller/GameController';

/** Hosts the Phaser canvas. Phaser is loaded lazily so menus appear instantly. */
export function Stage({ controller }: { controller: GameController }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let cancelled = false;
    import('../game/createGame')
      .then(m => { if (!cancelled && host.current) game = m.createPhaserGame(host.current, controller); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to start the renderer'));
    return () => { cancelled = true; game?.destroy(true); };
  }, [controller]);

  return (
    <div className="stage-canvas" ref={host} role="img" aria-label="Dungeon map">
      {error && <p className="notice">Renderer error: {error}</p>}
    </div>
  );
}
