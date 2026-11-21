
import { useEffect, useRef, useState } from 'react';
import {
  demos,
  ussdCode,
  type DemoPrompt,
  type DemoUsageData,
} from './demo-data';

type TextPhase =
  | 'idle'
  | 'typing-code'
  | 'dialing'
  | 'menu'
  | 'typing-choice'
  | 'sending'
  | 'result';

type PlaybackMode = 'autoplay' | 'click';

type TimelineEvent =
  | {
      at: number;
      kind: 'code';
      value: string;
      boundary: boolean;
    }
  | {
      at: number;
      kind: 'phase';
      value: TextPhase;
      boundary: boolean;
    }
  | {
      at: number;
      kind: 'open-menu';
      index: number;
      title: string;
      boundary: boolean;
    }
  | {
      at: number;
      kind: 'highlight';
      index: number;
      boundary: boolean;
    }
  | {
      at: number;
      kind: 'choice';
      value: string;
      boundary: boolean;
    }
  | {
      at: number;
      kind: 'send';
      menuIndex: number;
      choice: string;
      label: string;
      nextTitle?: string;
      final: boolean;
      boundary: boolean;
    }
  | {
      at: number;
      kind: 'refuse';
      boundary: boolean;
    }
  | {
      at: number;
      kind: 'visual-step';
      count: number;
      boundary: boolean;
    }
  | {
      at: number;
      kind: 'visual-done';
      boundary: boolean;
    };

const keys = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  '*', '0', '#',
];

/*
 * Both playback modes consume the same events.
 *
 * Autoplay runs every event at its scripted timestamp.
 * Click-through consumes events until the next meaningful boundary.
 *
 * No event communicates with an external service.
 */
function buildTimeline(
  demo: DemoPrompt,
  reduced: boolean,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const charDelay = reduced ? 20 : 250;
  const menuLineDelay = reduced ? 40 : 1000;
  const dialingBeat = reduced ? 40 : 650;
  const sendBeat = reduced ? 40 : 420;
  const visualStepDelay = reduced ? 60 : 570;

  let textTime = 0;

  for (let index = 0; index < ussdCode.length; index += 1) {
    textTime += charDelay;

    events.push({
      at: textTime,
      kind: 'code',
      value: ussdCode.slice(0, index + 1),
      boundary: index === ussdCode.length - 1,
    });
  }

  events.push({
    at: textTime + 1,
    kind: 'phase',
    value: 'dialing',
    boundary: true,
  });

  textTime += dialingBeat + 1;

  events.push({
    at: textTime,
    kind: 'open-menu',
    index: 0,
    title: demo.text.menus[0].title,
    boundary: true,
  });

  for (
    let menuIndex = 0;
    menuIndex < demo.text.menus.length;
    menuIndex += 1
  ) {
    const menu = demo.text.menus[menuIndex];

    const matchIndex =
      menu.choice === null
        ? -1
        : menu.options.findIndex(
            option => option.key === menu.choice,
          );

    const choice =
      matchIndex >= 0 ? menu.choice : null;

    const finalLine =
      choice === null
        ? menu.options.length - 1
        : matchIndex;

    for (
      let lineIndex = 0;
      lineIndex <= finalLine;
      lineIndex += 1
    ) {
      textTime += menuLineDelay;

      events.push({
        at: textTime,
        kind: 'highlight',
        index: lineIndex,
        boundary: lineIndex === finalLine,
      });
    }

    if (choice === null) {
      textTime += sendBeat;

      events.push({
        at: textTime,
        kind: 'refuse',
        boundary: true,
      });

      break;
    }

    textTime += 90;

    events.push({
      at: textTime,
      kind: 'phase',
      value: 'typing-choice',
      boundary: false,
    });

    for (
      let charIndex = 0;
      charIndex < choice.length;
      charIndex += 1
    ) {
      textTime += charDelay;

      events.push({
        at: textTime,
        kind: 'choice',
        value: choice.slice(0, charIndex + 1),
        boundary: charIndex === choice.length - 1,
      });
    }

    textTime += 90;

    events.push({
      at: textTime,
      kind: 'phase',
      value: 'sending',
      boundary: true,
    });

    textTime += sendBeat;

    const chosenOption = menu.options.find(
      option => option.key === choice,
    );

    const nextMenu = demo.text.menus[menuIndex + 1];

    events.push({
      at: textTime,
      kind: 'send',
      menuIndex,
      choice,
      label: chosenOption?.label ?? '',
      nextTitle: nextMenu?.title,
      final: !nextMenu,
      boundary: true,
    });
  }

  demo.visual.steps.forEach((_, index) => {
    events.push({
      at: visualStepDelay * (index + 1),
      kind: 'visual-step',
      count: index + 1,
      boundary: true,
    });
  });

  events.push({
    at: visualStepDelay * (demo.visual.steps.length + 1),
    kind: 'visual-done',
    boundary: true,
  });

  // Preserve insertion order when timestamps are equal.
  return events
    .map((event, order) => ({ event, order }))
    .sort((a, b) => (
      a.event.at - b.event.at || a.order - b.order
    ))
    .map(item => item.event);
}

function Figure({
  className = '',
}: {
  className?: string;
}) {
  return (
    <svg
      className={`line-figure ${className}`}
      viewBox="0 0 54 72"
      aria-hidden="true"
    >
      <circle cx="27" cy="11" r="7" />
      <path
        d="M27 18v25M27 25 11 35m16-10 16 10M27 43 15 65m12-22 13 22"
      />
      <path d="M7 67h40" />
    </svg>
  );
}

function AnimeMark() {
  return (
    <svg viewBox="0 0 32 38" aria-hidden="true">
      <path d="M16 2 28 9v20l-12 7L4 29V9zM10 13l6-5 6 5m-12 7 5 3 7-3m-10 7 10 0" />
    </svg>
  );
}

function DemoUsage({
  route,
  title,
}: {
  route: DemoUsageData | undefined;
  title: string;
}) {
  return (
    <div className="usage-line">
      <div className="usage-head">
        <strong>{title}</strong>
        <span>DEMO DATA · NOT MEASURED</span>
      </div>

      {route ? (
        <>
          <div className="usage-grid">
            <div className="usage-metric">
              <span>Input tokens</span>
              <b>{route.inputTokens}</b>
            </div>

            <div className="usage-metric">
              <span>Output tokens</span>
              <b>{route.outputTokens}</b>
            </div>

            <div className="usage-metric">
              <span>Model calls</span>
              <b>{route.calls}</b>
            </div>

            <div className="usage-metric">
              <span>Demo credits</span>
              <b>{route.credits}</b>
            </div>
          </div>

          <div className="usage-note">
            Fixed scripted counters for illustration.
            No model ran; these are not real tokens,
            credits, cost, or timing.
          </div>
        </>
      ) : (
        <div className="usage-note">
          Choose a prompt to show its fixed token
          and credit examples.
        </div>
      )}
    </div>
  );
}

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(
    null,
  );

  const [runNonce, setRunNonce] = useState(0);

  const [playbackMode, setPlaybackMode] =
    useState<PlaybackMode>('autoplay');

  const [clickCursor, setClickCursor] = useState(0);

  const [visibleVisualSteps, setVisibleVisualSteps] =
    useState(0);

  const [textPhase, setTextPhase] =
    useState<TextPhase>('idle');

  const [dialedCode, setDialedCode] = useState('');
  const [textMenuIndex, setTextMenuIndex] = useState(0);

  const [
    highlightedMenuLine,
    setHighlightedMenuLine,
  ] = useState(-1);

  const [typedChoice, setTypedChoice] = useState('');
  const [textHistory, setTextHistory] = useState<string[]>([]);

  const [textDone, setTextDone] = useState(false);
  const [visualDone, setVisualDone] = useState(false);

  const [
    prefersReducedMotion,
    setPrefersReducedMotion,
  ] = useState(false);

  const menuListRef = useRef<HTMLUListElement | null>(null);

  const selected = demos.find(
    demo => demo.id === selectedId,
  );

  const menuVisible =
    textPhase === 'menu' ||
    textPhase === 'typing-choice' ||
    textPhase === 'sending';

  const activeMenu =
    selected && menuVisible
      ? selected.text.menus[textMenuIndex]
      : undefined;

  /*
   * Reset both fictional routes before every new run.
   * No fictional state carries from one scenario to another.
   */
  function resetPlayback() {
    setTextPhase('typing-code');
    setDialedCode('');
    setTextMenuIndex(0);
    setHighlightedMenuLine(-1);
    setTypedChoice('');
    setTextHistory([]);
    setVisibleVisualSteps(0);
    setTextDone(false);
    setVisualDone(false);
    setClickCursor(0);
  }

  function runDemo(id: string) {
    resetPlayback();
    setSelectedId(id);
    setRunNonce(value => value + 1);
  }

  function changePlaybackMode(mode: PlaybackMode) {
    if (mode === playbackMode) return;

    setPlaybackMode(mode);

    if (selectedId !== null) {
      runDemo(selectedId);
    }
  }

  /*
   * Apply one scripted event to the visible interface.
   * This only updates local React state.
   */
  function applyEvent(event: TimelineEvent) {
    switch (event.kind) {
      case 'code':
        setDialedCode(event.value);
        break;

      case 'phase':
        setTextPhase(event.value);

        if (event.value === 'typing-choice') {
          setTypedChoice('');
        }
        break;

      case 'open-menu':
        setTextPhase('menu');
        setTextMenuIndex(event.index);
        setHighlightedMenuLine(-1);
        setTypedChoice('');

        setTextHistory([
          `Dialed ${ussdCode}`,
          `Menu opened · ${event.title}`,
        ]);
        break;

      case 'highlight':
        setHighlightedMenuLine(event.index);
        break;

      case 'choice':
        setTypedChoice(event.value);
        break;

      case 'send':
        setTextHistory(history => [
          ...history,
          `Reply sent · ${event.choice} ${event.label}`.trim(),
          ...(event.nextTitle
            ? [`Menu opened · ${event.nextTitle}`]
            : []),
        ]);

        if (event.final) {
          setTextPhase('result');
          setTextDone(true);
        } else {
          setTextMenuIndex(event.menuIndex + 1);
          setHighlightedMenuLine(-1);
          setTypedChoice('');
          setTextPhase('menu');
        }
        break;

      case 'refuse':
        setTextHistory(history => [
          ...history,
          'No matching option · no change sent',
        ]);
        setTextPhase('result');
        setTextDone(true);
        break;

      case 'visual-step':
        setVisibleVisualSteps(event.count);
        break;

      case 'visual-done':
        setVisualDone(true);
        break;
    }
  }

  useEffect(() => {
    const media = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );

    const updatePreference = () =>
      setPrefersReducedMotion(media.matches);

    updatePreference();

    media.addEventListener('change', updatePreference);

    return () =>
      media.removeEventListener(
        'change',
        updatePreference,
      );
  }, []);

  /*
   * Timed playback.
   *
   * Click-through mode does not create timers.
   * Clearing this effect also cancels an earlier scenario.
   */
  useEffect(() => {
    resetPlayback();

    if (!selected || playbackMode !== 'autoplay') {
      return;
    }

    const timeline = buildTimeline(
      selected,
      prefersReducedMotion,
    );

    const timers = timeline.map(event =>
      window.setTimeout(
        () => applyEvent(event),
        event.at,
      ),
    );

    return () => {
      timers.forEach(timer =>
        window.clearTimeout(timer),
      );
    };
  }, [
    selectedId,
    runNonce,
    playbackMode,
    prefersReducedMotion,
  ]);

  /*
   * Manual playback consumes all minor events up to
   * the next meaningful scripted checkpoint.
   *
   * This avoids requiring a separate click for every
   * character in the service code.
   */
  const clickTimeline = selected
    ? buildTimeline(selected, prefersReducedMotion)
    : [];

  const hasNextStep =
    playbackMode === 'click' &&
    selected !== undefined &&
    clickCursor < clickTimeline.length;

  function nextStep() {
    if (!hasNextStep) return;

    let cursor = clickCursor;

    while (cursor < clickTimeline.length) {
      const event = clickTimeline[cursor];

      applyEvent(event);
      cursor += 1;

      if (event.boundary) {
        break;
      }
    }

    setClickCursor(cursor);
  }

  useEffect(() => {
    if (!activeMenu || highlightedMenuLine < 0) {
      return;
    }

    const currentLine =
      menuListRef.current?.querySelector<HTMLElement>(
        '[data-highlighted="true"]',
      );

    currentLine?.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion
        ? 'auto'
        : 'smooth',
    });
  }, [
    activeMenu,
    highlightedMenuLine,
    prefersReducedMotion,
    textPhase,
  ]);

  const activeKey =
    selected && visibleVisualSteps > 0
      ? keys[(visibleVisualSteps - 1) % keys.length]
      : '';

  const frierenAdded =
    selected?.id === 'frieren' && visualDone;

  return (
    <div className="demo-shell">
      <header className="demo-topbar">
        <div className="demo-brand">
          QURUS <small>WATCHLIST ROUTE DEMO</small>
        </div>

        <div className="top-status">
          SCRIPTED DEMO
          <span aria-hidden="true">/</span>
          NO MODEL OR DATA API CALLS
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <div className="eyebrow">
              CLASSROOM DEMO · FICTIONAL STREAMING APP
            </div>

            <h1>
              One task.
              <span>Two routes.</span>
            </h1>
          </div>

          <div className="hero-note">
            Choose one fixed prompt and watch the same
            fictional Watchlist task play through two
            interface styles.

            <div className="hero-figure">
              <Figure />
              <span>
                All anime titles, accounts, actions,
                transcripts, and counters are fictional
                demo data.
              </span>
            </div>
          </div>
        </section>

        <section
          className="prompt-section"
          aria-labelledby="prompt-title"
        >
          <div className="section-title">
            <div>
              <div className="eyebrow">
                01 / PICK A SCRIPT
              </div>

              <h2 id="prompt-title">
                Choose a demo prompt
              </h2>
            </div>

            <p>
              Fixed prompts only · no free-typed tasks
            </p>
          </div>

          <div className="prompt-list">
            {demos.map((demo, index) => (
              <button
                key={demo.id}
                className="prompt-button"
                onClick={() => runDemo(demo.id)}
                aria-pressed={selectedId === demo.id}
                data-testid={`demo-prompt-${demo.id}`}
              >
                <span className="prompt-index">
                  Scenario {index + 1}
                </span>

                <span className="prompt-copy">
                  {demo.prompt}

                  <span className="prompt-status">
                    {demo.refused
                      ? 'Scripted refusal'
                      : 'Scripted result'}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <p className="scenario-reset-note">
            Each scenario runs on a fresh fictional
            watchlist. Choosing a new scenario resets
            the demo state on purpose.
          </p>
        </section>

        <section
          className="routes-section"
          aria-labelledby="routes-title"
        >
          <div className="routes-heading">
            <div>
              <div className="eyebrow">
                02 / SAME PROMPT, TWO INTERFACES
              </div>

              <h2 id="routes-title">
                The scripted comparison
              </h2>
            </div>

            <div className="playback-controls">
              <button
                className="replay-button"
                disabled={!selected}
                onClick={() =>
                  selected && runDemo(selected.id)
                }
                data-testid="replay-demo"
              >
                Replay both routes
              </button>

              <div
                className="playback-toggle"
                role="group"
                aria-label="Playback mode"
              >
                <button
                  type="button"
                  className={
                    playbackMode === 'autoplay'
                      ? 'playback-option active'
                      : 'playback-option'
                  }
                  aria-pressed={
                    playbackMode === 'autoplay'
                  }
                  onClick={() =>
                    changePlaybackMode('autoplay')
                  }
                  data-testid="mode-autoplay"
                >
                  Autoplay
                </button>

                <button
                  type="button"
                  className={
                    playbackMode === 'click'
                      ? 'playback-option active'
                      : 'playback-option'
                  }
                  aria-pressed={playbackMode === 'click'}
                  onClick={() =>
                    changePlaybackMode('click')
                  }
                  data-testid="mode-click-through"
                >
                  Click through
                </button>
              </div>

              {playbackMode === 'click' && (
                <button
                  type="button"
                  className="next-step-button"
                  disabled={!hasNextStep}
                  onClick={nextStep}
                  data-testid="next-step"
                >
                  {hasNextStep
                    ? 'Next step'
                    : selected
                      ? 'Complete'
                      : 'Next step'}
                </button>
              )}
            </div>
          </div>

          <div className="route-grid">
            <article
              className="route-column"
              aria-label="Scripted text and USSD route"
            >
              <div className="route-title">
                <h3>TEXT / USSD-STYLE</h3>

                <span className="demo-stamp">
                  SIMULATION · DEMO DATA
                </span>
              </div>

              <div className="phone">
                <div className="phone-camera" />

                <div className="phone-screen">
                  <div className="phone-status">
                    <span>9:41</span>
                    <span>•••</span>
                  </div>

                  <div className="phone-heading">
                    <strong>TEXT SESSION</strong>
                    <span>NOT CARRIER USSD</span>
                  </div>

                  <div className="agent-sim-label">
                    AGENT SIMULATION, SLOWED DOWN
                  </div>

                  <div
                    className="ussd-session"
                    role="log"
                    aria-live="polite"
                    data-testid="text-route-log"
                  >
                    {(
                      textPhase === 'idle' ||
                      textPhase === 'typing-code' ||
                      textPhase === 'dialing'
                    ) && (
                      <div
                        className="dial-screen"
                        data-testid="ussd-dial-screen"
                      >
                        <div className="dial-screen-title">
                          {selected
                            ? 'Enter service code'
                            : 'Service code'}
                        </div>

                        <div
                          className="dial-display"
                          aria-label={
                            `USSD code ${dialedCode || 'empty'}`
                          }
                        >
                          <span
                            className="dial-code-value"
                            data-testid="text-dial-entry"
                          >
                            {dialedCode || (
                              <span className="dial-placeholder">
                                &nbsp;
                              </span>
                            )}
                          </span>

                          <small>
                            {textPhase === 'dialing'
                              ? 'SENDING'
                              : 'USSD'}
                          </small>
                        </div>

                        <div
                          className="dial-pad"
                          aria-label="Illustrative dial pad"
                        >
                          {keys.map(key => (
                            <span
                              className="dial-key"
                              key={key}
                            >
                              {key}
                            </span>
                          ))}
                        </div>

                        <div
                          className={
                            `dial-status ${
                              textPhase === 'dialing'
                                ? 'dialing'
                                : ''
                            }`
                          }
                          data-testid="ussd-status"
                        >
                          {textPhase === 'dialing'
                            ? `Dialing ${ussdCode}…`
                            : selected
                              ? 'Agent is typing the service code'
                              : 'Choose a fixed prompt to begin'}
                        </div>
                      </div>
                    )}

                    {activeMenu && (
                      <div
                        className="ussd-menu"
                        data-testid="ussd-menu"
                      >
                        <div className="ussd-menu-title">
                          {activeMenu.title}
                        </div>

                        <ul
                          className="ussd-options"
                          ref={menuListRef}
                          aria-label={
                            `${activeMenu.title} options`
                          }
                        >
                          {activeMenu.options.map(
                            (option, index) => (
                              <li
                                key={
                                  `${activeMenu.title}-${option.key}`
                                }
                                className={
                                  `ussd-option ${
                                    highlightedMenuLine === index
                                      ? 'highlighted'
                                      : ''
                                  }`
                                }
                                aria-current={
                                  highlightedMenuLine === index
                                    ? 'step'
                                    : undefined
                                }
                                data-highlighted={
                                  highlightedMenuLine === index
                                    ? 'true'
                                    : 'false'
                                }
                                data-testid={
                                  `ussd-option-${index}`
                                }
                              >
                                <span className="ussd-option-key">
                                  {option.key}
                                </span>

                                <span>{option.label}</span>
                              </li>
                            ),
                          )}
                        </ul>

                        <div className="ussd-reply">
                          <span>Reply</span>

                          <output data-testid="ussd-reply">
                            {typedChoice || (
                              <span className="reply-placeholder">
                                &nbsp;
                              </span>
                            )}
                          </output>

                          <small>
                            {textPhase === 'sending'
                              ? 'Sending…'
                              : textPhase === 'typing-choice'
                                ? 'Agent typing'
                                : ' '}
                          </small>
                        </div>
                      </div>
                    )}

                    {textPhase === 'result' && selected && (
                      <div
                        className="ussd-result"
                        data-testid="ussd-result"
                      >
                        <span className="ussd-result-label">
                          {selected.refused
                            ? 'REFUSED · NO CHANGES'
                            : 'SCRIPTED RESULT'}
                        </span>

                        <p>{selected.text.reply}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="phone-foot" />
              </div>

              <div className="script-output">
                <h4>
                  Text route · USSD session log
                </h4>

                {textHistory.length > 0 ? (
                  textHistory.map((step, index) => (
                    <div
                      className="script-step"
                      key={`t-${index}`}
                    >
                      <b>
                        {String(index + 1).padStart(
                          2,
                          '0',
                        )}
                      </b>

                      <span>{step}</span>
                    </div>
                  ))
                ) : (
                  <div className="idle-note">
                    {selected
                      ? 'Waiting for the code to finish typing and dial.'
                      : 'No session is active.'}
                    <br />
                    The menu appears only after dialing.
                  </div>
                )}

                {selected && textDone && (
                  <div
                    className={
                      `script-reply ${
                        selected.refused
                          ? 'refusal'
                          : ''
                      }`
                    }
                  >
                    <strong>
                      {selected.refused
                        ? 'Refused · no changes'
                        : 'Scripted result'}
                    </strong>

                    {selected.text.reply}
                  </div>
                )}
              </div>

              <DemoUsage
                route={
                  textDone
                    ? selected?.text
                    : undefined
                }
                title="TEXT ROUTE COUNTERS"
              />
            </article>

            <article
              className="route-column"
              aria-label="Scripted visual web route with phone keypad"
            >
              <div className="route-title">
                <h3>VISUAL / WEB</h3>

                <span className="demo-stamp">
                  SIMULATION · DEMO DATA
                </span>
              </div>

              <div className="phone">
                <div className="phone-camera" />

                <div className="phone-screen">
                  <div className="phone-status">
                    <span>9:41</span>
                    <span>•••</span>
                  </div>

                  <div className="watchlist-screen">
                    <div className="watchlist-top">
                      <strong>WATCHLIST</strong>
                      <span>DEMO PROFILE</span>
                    </div>

                    <div className="watchlist-profile">
                      MY LIST · FICTIONAL TITLES
                    </div>

                    <div
                      className={
                        `anime-row ${
                          selected?.id === 'frieren'
                            ? 'active'
                            : ''
                        }`
                      }
                    >
                      <div className="anime-art">
                        <AnimeMark />
                      </div>

                      <div className="anime-info">
                        <b>Frieren</b>
                        <span>
                          {frierenAdded
                            ? 'Saved to My List'
                            : 'Discover · Fantasy'}
                        </span>
                      </div>

                      <span className="anime-action">
                        {frierenAdded ? 'SAVED' : 'ADD'}
                      </span>
                    </div>

                    <div
                      className={
                        `anime-row ${
                          selected?.id === 'continue'
                            ? 'active'
                            : ''
                        }`
                      }
                    >
                      <div className="anime-art">
                        <Figure />
                      </div>

                      <div className="anime-info">
                        <b>Jujutsu Kaisen</b>
                        <span>
                          My List · Episode 12
                        </span>
                      </div>

                      <span className="anime-action">
                        {selected?.id === 'continue' &&
                        visualDone
                          ? 'PLAY'
                          : 'OPEN'}
                      </span>
                    </div>

                    <div className="anime-row">
                      <div className="anime-art">
                        <AnimeMark />
                      </div>

                      <div className="anime-info">
                        <b>Spy x Family</b>
                        <span>
                          My List · Episode 3
                        </span>
                      </div>

                      <span className="anime-action">
                        OPEN
                      </span>
                    </div>

                    <div className="anime-row">
                      <div className="anime-art">
                        <Figure />
                      </div>

                      <div className="anime-info">
                        <b>Mob Psycho 100</b>
                        <span>
                          My List · Episode 4
                        </span>
                      </div>

                      <span className="anime-action">
                        OPEN
                      </span>
                    </div>

                    <div className="keypad-label">
                      Illustrative input pad · scripted
                    </div>

                    <div
                      className="keypad"
                      aria-label="Illustrative demo keypad"
                    >
                      {keys.map(key => (
                        <span
                          className={
                            `key ${
                              key === activeKey
                                ? 'active'
                                : ''
                            }`
                          }
                          key={key}
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="phone-foot" />
              </div>

              <div className="script-output">
                <h4>
                  Visual route · scripted screen actions
                </h4>

                {selected ? (
                  selected.visual.steps
                    .slice(0, visibleVisualSteps)
                    .map((step, index) => (
                      <div
                        className="script-step"
                        key={`v-${index}`}
                      >
                        <b>
                          {String(index + 1).padStart(
                            2,
                            '0',
                          )}
                        </b>

                        <span>{step}</span>
                      </div>
                    ))
                ) : (
                  <div className="idle-note">
                    A fictional Watchlist screen.
                    <br />
                    Select a prompt to play visual steps.
                  </div>
                )}

                {selected && visualDone && (
                  <div
                    className={
                      `script-reply ${
                        selected.refused
                          ? 'refusal'
                          : ''
                      }`
                    }
                  >
                    <strong>
                      {selected.refused
                        ? 'Refused · no changes'
                        : 'Scripted result'}
                    </strong>

                    {selected.visual.reply}
                  </div>
                )}
              </div>

              <DemoUsage
                route={
                  visualDone
                    ? selected?.visual
                    : undefined
                }
                title="VISUAL ROUTE COUNTERS"
              />
            </article>
          </div>
        </section>

        <section className="explainer">
          <h2>HONEST STATUS</h2>

          <div>
            <p>
              We tried wiring this to the Gemini API
              but couldn't get it working in time,
              so this demo runs on scripted demo data.
              The architecture (text/USSD route vs
              visual route, credit counters) is what
              we are demonstrating.
            </p>

            <p className="hypothesis">
              The claim that USSD saves credits is a
              hypothesis, not a measured result.
              Every transcript and counter above is
              pre-written demo data.
            </p>
          </div>
        </section>
      </main>

      <footer className="demo-foot">
        <span>
          QURUS · FICTIONAL WATCHLIST
        </span>

        <span>
          No model calls · no account, payment,
          or streaming service is connected.
        </span>
      </footer>
    </div>
  );
}

export default App;

