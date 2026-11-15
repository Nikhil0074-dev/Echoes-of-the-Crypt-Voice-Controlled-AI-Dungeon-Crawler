import { useState } from 'react';
import type { GameController, Phase, UiSnapshot } from '../controller/GameController';
import { summarize } from '../controller/GameController';
import { suggestCommands } from '../controller/suggestions';
import type { VoiceApi } from './hooks';

const PHASE_TEXT: Record<Phase, string> = {
  idle: 'Mic off', listening: 'Listening…', processing: 'Interpreting…', recognized: 'Understood',
  executing: 'Executing…', completed: 'Done', failed: "Couldn't do that"
};

export function VoiceConsole({ controller, snap, voice }: { controller: GameController; snap: UiSnapshot; voice: VoiceApi }) {
  const [text, setText] = useState('');
  const cmd = snap.lastCommand;
  const busy = snap.phase === 'processing' || snap.phase === 'executing';
  const suggestions = snap.settings.showHints ? suggestCommands(snap.state) : [];

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    void controller.submitText(t, 'text');
  };

  return (
    <section className="console panel" aria-label="Voice console">
      <div className="console-top">
        <button
          type="button"
          className={`orb orb-${snap.micOn ? 'on' : 'off'} ${busy ? 'orb-busy' : ''} ${!voice.supported ? 'orb-dead' : ''}`}
          onClick={voice.toggle}
          disabled={!voice.supported}
          aria-pressed={snap.micOn}
          aria-label={snap.micOn ? 'Stop listening' : 'Start listening'}
          title={voice.supported ? 'Toggle microphone (M)' : 'Speech recognition is not available in this browser'}
        >
          <span className="orb-core" aria-hidden="true">
            <span className="wave"><i /><i /><i /><i /><i /></span>
          </span>
        </button>

        <div className="readout">
          <div className={`chip phase phase-${snap.phase}`} data-testid="phase">{PHASE_TEXT[snap.phase]}</div>
          <div className="heard" aria-live="polite" data-testid="heard">
            {snap.interim ? <span className="interim">{snap.interim}…</span>
              : snap.transcript ? <>“{snap.transcript}”</> : <span className="muted">Say a command, or type one below.</span>}
          </div>
          {cmd && (
            <div className="interp" data-testid="interp">
              <span className="chip">{summarize(cmd)}</span>
              <span className="chip dim">{Math.round(cmd.confidence * 100)}%</span>
              <span className="chip dim">{cmd.source === 'llm' ? 'AI' : cmd.source === 'keyboard' ? 'KEY' : 'LOCAL'}</span>
            </div>
          )}
        </div>
      </div>

      <div className={`feedback ${snap.clarification ? 'ask' : ''}`} role="status" aria-live="polite" data-testid="feedback">
        {snap.micError ?? snap.message}
      </div>
      {!voice.supported && <div className="notice">Voice recognition isn’t supported in this browser. Typing and keyboard controls still work.</div>}

      <div className="typebar">
        <input
          aria-label="Type a command"
          value={text}
          maxLength={300}
          placeholder="Type a command, e.g. “go to the chest and open it”"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); e.stopPropagation(); }}
        />
        <button type="button" className="btn small" onClick={submit} disabled={!text.trim()}>Send</button>
      </div>

      {suggestions.length > 0 && (
        <div className="suggest" aria-label="Suggested commands">
          <span className="muted">Try:</span>
          {suggestions.map(s => (
            <button type="button" key={s} className="chip action" onClick={() => void controller.submitText(s, 'text')}>{s}</button>
          ))}
        </div>
      )}

      <ol className="history" aria-label="Command history">
        {[...snap.history].reverse().slice(0, 5).map(h => (
          <li key={h.id} className={`h-${h.status}`}>
            <span className="h-dot" aria-hidden="true" />
            <span className="h-text">“{h.transcript}”</span>
            <span className="h-sum">{h.summary}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
