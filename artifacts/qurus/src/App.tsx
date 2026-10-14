import { useEffect, useState } from 'react';

type DemoRoute = {
  steps: string[];
  reply: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  credits: number;
};

type DemoPrompt = {
  id: string;
  prompt: string;
  text: DemoRoute;
  visual: DemoRoute;
  refused?: boolean;
};

const demos: DemoPrompt[] = [
  {
    id: 'frieren',
    prompt: 'Add Frieren to my watchlist.',
    text: {
      steps: ['Dial *123#', '2 · Watchlist', '1 · Add a title', 'Search result · Frieren', '1 · Confirm add'],
      reply: 'Frieren is now on your watchlist.',
      inputTokens: 58, outputTokens: 19, calls: 2, credits: 4,
    },
    visual: {
      steps: ['Open Watchlist', 'Find Frieren in Discover', 'Select “Add to list”', 'Confirm · Frieren saved'],
      reply: 'Frieren added to the fictional watchlist.',
      inputTokens: 620, outputTokens: 22, calls: 3, credits: 13,
    },
  },
  {
    id: 'continue',
    prompt: 'Continue Jujutsu Kaisen from episode 12.',
    text: {
      steps: ['Dial *123#', '1 · Continue watching', 'Jujutsu Kaisen · Episode 12', '1 · Resume'],
      reply: 'Resuming Jujutsu Kaisen at episode 12.',
      inputTokens: 72, outputTokens: 21, calls: 2, credits: 5,
    },
    visual: {
      steps: ['Open the Jujutsu Kaisen row', 'Read progress · Episode 12', 'Select “Continue”'],
      reply: 'Playback would continue at episode 12 in this scripted example.',
      inputTokens: 790, outputTokens: 28, calls: 4, credits: 17,
    },
  },
  {
    id: 'renewal',
    prompt: 'Cancel my subscription renewal.',
    text: {
      steps: ['Dial *123#', '3 · Account settings', '2 · Renewal status', '1 · Turn renewal off'],
      reply: 'Fictional renewal is marked off. No payment or account service was contacted.',
      inputTokens: 60, outputTokens: 19, calls: 2, credits: 4,
    },
    visual: {
      steps: ['Open fictional account settings', 'Choose “Renewal: on”', 'Select “Turn renewal off”'],
      reply: 'Renewal marked off in demo data only. No subscription service was contacted.',
      inputTokens: 650, outputTokens: 24, calls: 3, credits: 14,
    },
  },
  {
    id: 'list',
    prompt: 'What is on my watchlist?',
    text: {
      steps: ['Dial *123#', '2 · Watchlist', 'Read 3 saved titles'],
      reply: 'Jujutsu Kaisen (episode 12), Spy x Family (episode 3), and Mob Psycho 100 (episode 4).',
      inputTokens: 44, outputTokens: 23, calls: 1, credits: 3,
    },
    visual: {
      steps: ['Open “My list”', 'Read the three visible titles and progress'],
      reply: 'Your list: Jujutsu Kaisen, Spy x Family, and Mob Psycho 100.',
      inputTokens: 590, outputTokens: 19, calls: 2, credits: 12,
    },
  },
  {
    id: 'premium',
    prompt: 'Buy me a premium plan.',
    refused: true,
    text: {
      steps: ['Dial *123#', 'No purchase option in this demo', 'Refuse without changing data'],
      reply: 'I can’t buy a plan here. This demo has no checkout or payment connection.',
      inputTokens: 39, outputTokens: 20, calls: 1, credits: 2,
    },
    visual: {
      steps: ['Inspect the fictional Watchlist screen', 'No purchase control is available', 'Refuse without changing data'],
      reply: 'Premium purchases are unsupported. No purchase or account change was made.',
      inputTokens: 520, outputTokens: 17, calls: 2, credits: 11,
    },
  },
  {
    id: 'delete',
    prompt: 'Delete my account.',
    refused: true,
    text: {
      steps: ['Dial *123#', 'No account deletion option', 'Refuse without changing data'],
      reply: 'I can’t delete accounts in this demo. No account data was changed.',
      inputTokens: 41, outputTokens: 22, calls: 1, credits: 2,
    },
    visual: {
      steps: ['Open the fictional profile screen', 'No deletion control is available', 'Refuse without changing data'],
      reply: 'Account deletion is unsupported. No account data was changed.',
      inputTokens: 570, outputTokens: 18, calls: 2, credits: 12,
    },
  },
];

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function Figure({ className = '' }: { className?: string }) {
  return <svg className={`line-figure ${className}`} viewBox="0 0 54 72" aria-hidden="true">
    <circle cx="27" cy="11" r="7" />
    <path d="M27 18v25M27 25 11 35m16-10 16 10M27 43 15 65m12-22 13 22" />
    <path d="M7 67h40" />
  </svg>;
}

function AnimeMark() {
  return <svg viewBox="0 0 32 38" aria-hidden="true">
    <path d="M16 2 28 9v20l-12 7L4 29V9zM10 13l6-5 6 5m-12 7 5 3 7-3m-10 7 10 0" />
  </svg>;
}

function DemoUsage({ route, title }: { route: DemoRoute | undefined; title: string }) {
  return <div className="usage-line">
    <div className="usage-head"><strong>{title}</strong><span>DEMO DATA · NOT MEASURED</span></div>
    {route ? <>
      <div className="usage-grid">
        <div className="usage-metric"><span>Input tokens</span><b>{route.inputTokens}</b></div>
        <div className="usage-metric"><span>Output tokens</span><b>{route.outputTokens}</b></div>
        <div className="usage-metric"><span>Model calls</span><b>{route.calls}</b></div>
        <div className="usage-metric"><span>Demo credits</span><b>{route.credits}</b></div>
      </div>
      <div className="usage-note">Fixed scripted counters for illustration. No model ran; these are not real tokens, credits, cost, or timing.</div>
    </> : <div className="usage-note">Choose a prompt to show its fixed token and credit examples.</div>}
  </div>;
}

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const [visibleTextSteps, setVisibleTextSteps] = useState(0);
  const [visibleVisualSteps, setVisibleVisualSteps] = useState(0);
  const [textDone, setTextDone] = useState(false);
  const [visualDone, setVisualDone] = useState(false);
  const selected = demos.find(demo => demo.id === selectedId);

  function runDemo(id: string) {
    setSelectedId(id);
    setVisibleTextSteps(0);
    setVisibleVisualSteps(0);
    setTextDone(false);
    setVisualDone(false);
    setRunNonce(value => value + 1);
  }

  useEffect(() => {
    if (!selected) return;
    const timers: number[] = [];
    selected.text.steps.forEach((_, index) => {
      timers.push(window.setTimeout(() => setVisibleTextSteps(index + 1), 420 * (index + 1)));
    });
    timers.push(window.setTimeout(() => setTextDone(true), 420 * (selected.text.steps.length + 1)));
    selected.visual.steps.forEach((_, index) => {
      timers.push(window.setTimeout(() => setVisibleVisualSteps(index + 1), 570 * (index + 1)));
    });
    timers.push(window.setTimeout(() => setVisualDone(true), 570 * (selected.visual.steps.length + 1)));
    return () => timers.forEach(window.clearTimeout);
  }, [selectedId, runNonce]);

  const activeKey = selected && visibleVisualSteps > 0
    ? keys[(visibleVisualSteps - 1) % keys.length]
    : '';
  const frierenAdded = selected?.id === 'frieren' && visualDone;

  return <div className="demo-shell">
    <header className="demo-topbar">
      <div className="demo-brand">QURUS <small>WATCHLIST ROUTE DEMO</small></div>
      <div className="top-status">SCRIPTED DEMO <span aria-hidden="true">/</span> NO MODEL OR DATA API CALLS</div>
    </header>

    <main>
      <section className="hero">
        <div>
          <div className="eyebrow">CLASSROOM DEMO · FICTIONAL STREAMING APP</div>
          <h1>One task.<span>Two routes.</span></h1>
        </div>
        <div className="hero-note">
          Choose one fixed prompt and watch the same fictional Watchlist task play through two interface styles.
          <div className="hero-figure"><Figure /><span>All anime titles, accounts, actions, transcripts, and counters are fictional demo data.</span></div>
        </div>
      </section>

      <section className="prompt-section" aria-labelledby="prompt-title">
        <div className="section-title">
          <div><div className="eyebrow">01 / PICK A SCRIPT</div><h2 id="prompt-title">Choose a demo prompt</h2></div>
          <p>Fixed prompts only · no free-typed tasks</p>
        </div>
        <div className="prompt-list">
          {demos.map((demo, index) => <button
            key={demo.id}
            className="prompt-button"
            onClick={() => runDemo(demo.id)}
            aria-pressed={selectedId === demo.id}
            data-testid={`demo-prompt-${demo.id}`}
          >
            <span className="prompt-index">0{index + 1}</span>
            <span className="prompt-copy">{demo.prompt}<span className="prompt-status">{demo.refused ? 'Scripted refusal' : 'Scripted result'}</span></span>
          </button>)}
        </div>
      </section>

      <section className="routes-section" aria-labelledby="routes-title">
        <div className="routes-heading">
          <div><div className="eyebrow">02 / SAME PROMPT, TWO INTERFACES</div><h2 id="routes-title">The scripted comparison</h2></div>
          <button className="replay-button" disabled={!selected} onClick={() => selected && runDemo(selected.id)} data-testid="replay-demo">Replay both routes</button>
        </div>

        <div className="route-grid">
          <article className="route-column" aria-label="Scripted text and USSD route">
            <div className="route-title"><h3>TEXT / USSD-STYLE</h3><span className="demo-stamp">SIMULATION · DEMO DATA</span></div>
            <div className="phone">
              <div className="phone-camera" />
              <div className="phone-screen">
                <div className="phone-status"><span>9:41</span><span>•••</span></div>
                <div className="phone-heading"><strong>Messages</strong><span>TEXT MENU · NOT CARRIER USSD</span></div>
                <div className="chat-log" role="log" aria-live="polite" data-testid="text-route-log">
                  {!selected && <div className="chat-note">Choose a demo prompt above to play its scripted text-menu session.</div>}
                  {selected && <>
                    <div className="chat-note chat-prompt">{selected.prompt}</div>
                    <div className="chat-step-label">Watchlist demo menu</div>
                    {selected.text.steps.slice(0, visibleTextSteps).map((step, index) => <div className="chat-note" key={`${selected.id}-text-${index}`}>{step}</div>)}
                    {!textDone && <div className="chat-note typing-dots" aria-label="Script animating"><i /><i /><i /></div>}
                    {textDone && <div className={`chat-note ${selected.refused ? '' : 'chat-result'}`}><strong>{selected.refused ? 'REFUSAL' : 'SCRIPTED RESULT'}</strong><br />{selected.text.reply}</div>}
                  </>}
                </div>
              </div>
              <div className="phone-foot" />
            </div>
            <div className="script-output">
              <h4>Text route · scripted menu choices</h4>
              {selected ? selected.text.steps.slice(0, visibleTextSteps).map((step, index) => <div className="script-step" key={`t-${index}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{step}</span></div>) : <div className="idle-note">No transcript is prefilled.<br />Select a fixed prompt to begin.</div>}
              {selected && textDone && <div className={`script-reply ${selected.refused ? 'refusal' : ''}`}><strong>{selected.refused ? 'Refused · no changes' : 'Scripted result'}</strong>{selected.text.reply}</div>}
            </div>
            <DemoUsage route={textDone ? selected?.text : undefined} title="TEXT ROUTE COUNTERS" />
          </article>

          <article className="route-column" aria-label="Scripted visual web route with phone keypad">
            <div className="route-title"><h3>VISUAL / WEB</h3><span className="demo-stamp">SIMULATION · DEMO DATA</span></div>
            <div className="phone">
              <div className="phone-camera" />
              <div className="phone-screen">
                <div className="phone-status"><span>9:41</span><span>•••</span></div>
                <div className="watchlist-screen">
                  <div className="watchlist-top"><strong>WATCHLIST</strong><span>DEMO PROFILE</span></div>
                  <div className="watchlist-profile">MY LIST · FICTIONAL TITLES</div>
                  <div className={`anime-row ${selected?.id === 'frieren' ? 'active' : ''}`}>
                    <div className="anime-art"><AnimeMark /></div>
                    <div className="anime-info"><b>Frieren</b><span>{frierenAdded ? 'Saved to My List' : 'Discover · Fantasy'}</span></div>
                    <span className="anime-action">{frierenAdded ? 'SAVED' : 'ADD'}</span>
                  </div>
                  <div className={`anime-row ${selected?.id === 'continue' ? 'active' : ''}`}>
                    <div className="anime-art"><Figure /></div>
                    <div className="anime-info"><b>Jujutsu Kaisen</b><span>My List · Episode 12</span></div>
                    <span className="anime-action">{selected?.id === 'continue' && visualDone ? 'PLAY' : 'OPEN'}</span>
                  </div>
                  <div className="anime-row">
                    <div className="anime-art"><AnimeMark /></div>
                    <div className="anime-info"><b>Spy x Family</b><span>My List · Episode 3</span></div>
                    <span className="anime-action">OPEN</span>
                  </div>
                  <div className="anime-row">
                    <div className="anime-art"><Figure /></div>
                    <div className="anime-info"><b>Mob Psycho 100</b><span>My List · Episode 4</span></div>
                    <span className="anime-action">OPEN</span>
                  </div>
                  <div className="keypad-label">Illustrative input pad · scripted</div>
                  <div className="keypad" aria-label="Illustrative demo keypad">
                    {keys.map(key => <span className={`key ${key === activeKey ? 'active' : ''}`} key={key}>{key}</span>)}
                  </div>
                </div>
              </div>
              <div className="phone-foot" />
            </div>
            <div className="script-output">
              <h4>Visual route · scripted screen actions</h4>
              {selected ? selected.visual.steps.slice(0, visibleVisualSteps).map((step, index) => <div className="script-step" key={`v-${index}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{step}</span></div>) : <div className="idle-note">A fictional Watchlist screen.<br />Select a prompt to play visual steps.</div>}
              {selected && visualDone && <div className={`script-reply ${selected.refused ? 'refusal' : ''}`}><strong>{selected.refused ? 'Refused · no changes' : 'Scripted result'}</strong>{selected.visual.reply}</div>}
            </div>
            <DemoUsage route={visualDone ? selected?.visual : undefined} title="VISUAL ROUTE COUNTERS" />
          </article>
        </div>
      </section>

      <section className="explainer">
        <h2>HONEST STATUS</h2>
        <div>
          <p>We tried wiring this to the Gemini API but couldn't get it working in time, so this demo runs on scripted demo data. The architecture (text/USSD route vs visual route, credit counters) is what we are demonstrating.</p>
          <p className="hypothesis">The claim that USSD saves credits is a hypothesis, not a measured result. Every transcript and counter above is pre-written demo data.</p>
        </div>
      </section>
    </main>

    <footer className="demo-foot"><span>QURUS · FICTIONAL WATCHLIST</span><span>No model calls · no account, payment, or streaming service is connected.</span></footer>
  </div>;
}

export default App;
