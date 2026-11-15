export const COMMAND_GUIDE: { title: string; examples: string[] }[] = [
  { title: 'Move', examples: ['Move three steps north', 'Go two tiles to the left', 'Keep going east', 'Move carefully and avoid the traps', 'Follow the corridor'] },
  { title: 'Travel', examples: ['Go to the treasure chest', 'Head towards the exit', 'Find the key', 'Go to the next room'] },
  { title: 'Fight', examples: ['Attack the goblin', 'Hit it', 'Defend', 'Dodge to the left', 'Retreat'] },
  { title: 'Interact', examples: ['Open the door', 'Unlock the door', 'Open the chest', 'Enter the portal'] },
  { title: 'Items', examples: ['Pick up the key', 'Use my health potion', 'Equip the shield', 'Drop the shield', 'Show my inventory'] },
  { title: 'Look & Ask', examples: ['Look around', 'Where is the key?', 'How much health do I have?', 'What is my objective?', 'How many enemies are nearby?'] },
  { title: 'Combos', examples: ['Walk two steps to the right and attack the goblin', 'Go to the chest and open it', 'Move east twice, then open the door'] },
  { title: 'System', examples: ['Pause the game', 'Resume', 'Save my progress', 'Mute the sound', 'Stop listening', 'Help'] }
];

export function VoiceGuide() {
  return (
    <div className="guide">
      <p className="muted">Speak naturally. The parser understands many phrasings; the game engine always has the final say.</p>
      <div className="guide-grid">
        {COMMAND_GUIDE.map(g => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <ul>{g.examples.map(e => <li key={e}>“{e}”</li>)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function HowToPlay() {
  return (
    <div className="guide">
      <p>You are a lone wanderer in the <b>Crypt of Echoes</b>. Speak (or type) commands to guide your hero. Your torch only lights what is near; the rest stays in darkness until explored.</p>
      <ol className="steps">
        <li><b>Press the glowing orb</b> (or <kbd>M</kbd>) and say “look around”.</li>
        <li>Find the <b>dungeon key</b>, open the <b>locked door</b>, and claim the treasure.</li>
        <li>Defeat the <b>Skeleton Guardian</b> and step through the portal.</li>
      </ol>
      <h3>Keyboard fallback</h3>
      <p className="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>/arrows move · <kbd>Space</kbd> attack · <kbd>E</kbd> interact · <kbd>F</kbd> pick up · <kbd>Q</kbd> potion · <kbd>M</kbd> mic · <kbd>P</kbd> pause</p>
      <h3>Rules</h3>
      <ul>
        <li>Damage = attack − defense (min 1). Enemies strike back after most actions.</li>
        <li>Multi-step commands stop as soon as something goes wrong.</li>
        <li>Unclear commands never run; the game asks you to clarify.</li>
      </ul>
    </div>
  );
}

export function Credits() {
  return (
    <div className="guide">
      <p><b>Echoes of the Crypt</b> — a voice-controlled AI dungeon crawler.</p>
      <ul>
        <li>Engine: Phaser 3, React, TypeScript</li>
        <li>Speech: Web Speech API (browser)</li>
        <li>Command AI: built-in rule parser, optional Claude API on the server</li>
        <li>Art &amp; sound: generated in code — no external assets</li>
        <li>Fonts: Press Start 2P, VT323 (OFL)</li>
      </ul>
    </div>
  );
}
