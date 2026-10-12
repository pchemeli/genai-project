import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  getGetLibraryStateQueryKey, getReadDueDateQueryKey, useGetLibraryState, useRenewLoan,
  useReserveTitle, useCancelHold, useReadDueDate, useResetLibrary, useStartTextSession,
  useInputTextSession, useRunAgent,
} from '@workspace/api-client-react';
import type { AgentRunResult, ActionResult, TextSessionResult } from '@workspace/api-client-react';
import {
  ArrowRight, BookOpen, Check, CircleHelp, Clock3, LibraryBig, LoaderCircle,
  RotateCcw, Search, ShieldCheck, Signal, Smartphone, Sparkles, X,
} from 'lucide-react';

const queryClient = new QueryClient();

const prompts = [
  'Renew my copy of The Long Way Home.',
  'Reserve Field Notes on Cities.',
  'Cancel my hold on Quiet Rivers.',
  'When is The Long Way Home due?',
  'Renew Data for Everyone.',
  'Pay my library fine.',
];

function makeKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Request failed');
}

function displayDate(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function displayDateTime(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <div className="app-shell">
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-qurus-home"><span className="brand-mark">q</span><span>qurus</span><span className="brand-caption">CLASSROOM LAB</span></Link>
      <nav className="topnav" aria-label="Main navigation">
        <Link href="/" className={location === '/' ? 'nav-link active' : 'nav-link'} data-testid="link-runner"><span className="nav-index">01</span> Compare</Link>
        <Link href="/library" className={location === '/library' ? 'nav-link active' : 'nav-link'} data-testid="link-library"><span className="nav-index">02</span> Shelf library</Link>
      </nav>
      <div className="top-status"><span className="status-dot" /> FICTIONAL SYSTEM <span className="top-sep">/</span> LIVE DEMO</div>
    </header>
    {children}
    <footer className="footer"><span>QURUS <span className="footer-dot">•</span> A CLASSROOM EXPERIMENT</span><span>Same request. Two interfaces. Verifiable results.</span></footer>
  </div>;
}

function Runner() {
  const queryClient = useQueryClient();
  const libraryQuery = useGetLibraryState();
  const reset = useResetLibrary();
  const startText = useStartTextSession();
  const inputText = useInputTextSession();
  const runAgent = useRunAgent();
  const [promptText, setPromptText] = useState(prompts[0]);
  const [agentResults, setAgentResults] = useState<Partial<Record<'text' | 'web', AgentRunResult>>>({});
  const [textSession, setTextSession] = useState<TextSessionResult | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [runnerError, setRunnerError] = useState('');
  const [lastTextPrompt, setLastTextPrompt] = useState('');
  const [phoneFrame, setPhoneFrame] = useState({
    menu: 'Start a text session or run a prompt to see the API menu.',
    digit: '',
    typing: false,
    error: '',
  });

  function run(route: 'text' | 'web') {
    if (!promptText.trim()) return;
    setRunnerError('');
    if (route === 'text') setLastTextPrompt(promptText);
    runAgent.mutate({ data: { prompt: promptText.trim(), route, idempotencyKey: makeKey() } }, {
      onSuccess: result => {
        setAgentResults(prev => ({ ...prev, [route]: result }));
        if (route === 'text') {
          setTextSession(null);
          if (result.textSteps.length === 0) {
            setPhoneFrame({ menu: 'No text-menu action was needed for this request.', digit: '', typing: false, error: '' });
            return;
          }
          setPhoneFrame({ menu: 'Agent is dialing *123#…', digit: '', typing: true, error: '' });
          void (async () => {
            for (const step of result.textSteps) {
              if (step.digit === '*123#') {
                let dial = '';
                for (const char of step.digit) {
                  dial += char;
                  setPhoneFrame({ menu: 'Connecting to the Shelf demo…', digit: dial, typing: true, error: '' });
                  await new Promise(resolve => setTimeout(resolve, 90));
                }
              } else {
                setPhoneFrame(prev => ({ ...prev, digit: step.digit, typing: true }));
                await new Promise(resolve => setTimeout(resolve, 360));
              }
              setPhoneFrame({ menu: step.menu, digit: step.digit, typing: false, error: step.error ?? '' });
              await new Promise(resolve => setTimeout(resolve, 430));
            }
          })();
        }
      },
      onError: error => setRunnerError(`${route.toUpperCase()} run: ${errorMessage(error)}`),
    });
  }
  function beginText() {
    setAgentResults(prev => ({ ...prev, text: undefined }));
    setLastTextPrompt('');
    setTextSession(null);
    setPhoneFrame({ menu: 'Connecting to Shelf…', digit: '*123#', typing: true, error: '' });
    setSessionError('');
    startText.mutate({ data: { code: '*123#' } }, {
      onSuccess: result => {
        setTextSession(result);
        setPhoneFrame({ menu: result.menu, digit: '*123#', typing: false, error: '' });
      },
      onError: error => setSessionError(errorMessage(error)),
    });
  }
  function pressDigit(digit: string) {
    if (!textSession?.sessionId) return;
    setSessionError('');
    setPhoneFrame(prev => ({ ...prev, digit, typing: true }));
    inputText.mutate({ sessionId: textSession.sessionId, data: { digit } }, {
      onSuccess: result => {
        setTextSession(result);
        setPhoneFrame({ menu: result.menu, digit, typing: false, error: result.error ?? '' });
      },
      onError: error => setSessionError(errorMessage(error)),
    });
  }
  const userName = libraryQuery.data?.user.displayName;
  return <>
  <main className="page runner-page">
    <section className="runner-intro">
      <div className="eyebrow"><span className="eyebrow-line" /> A CONTROLLED COMPARISON <span className="eyebrow-count">01 — 02</span></div>
      <div className="intro-grid">
        <div><h1>One request.<br /><em>Two ways through.</em></h1></div>
        <div className="intro-copy">
          <p>Watch a simulated library agent carry the same student request through a text menu and a familiar website. Every outcome comes from the API and can be checked against Shelf’s state.</p>
          <div className="intro-meta"><span><ShieldCheck size={15} /> Observable by design</span><span><span className="mono">SHELF</span> · Fictional library</span></div>
        </div>
      </div>
      <div className="experiment-strip">
        <span className="strip-label">CURRENT FIXTURE</span>
        {libraryQuery.isLoading ? <span className="strip-value">Loading fixture…</span> : libraryQuery.isError ? <span className="strip-error" data-testid="error-library-state">{errorMessage(libraryQuery.error)}</span> : <><span className="strip-value" data-testid="text-demo-user">{userName ?? 'Demo reader'}</span><span className="strip-divider" /><span className="strip-value">{libraryQuery.data?.books.length ?? 0} titles · {libraryQuery.data?.loans.length ?? 0} loans · {libraryQuery.data?.holds.length ?? 0} holds</span></>}
        <Link href="/library" className="strip-link" data-testid="link-open-catalog">Open Shelf <ArrowRight size={15} /></Link>
      </div>
    </section>

    <section className="prompt-area">
      <div className="section-heading"><div><div className="eyebrow">THE REQUEST</div><h2>Give the agent a task</h2></div><span className="small-note">Choose an example or type your own.</span></div>
      <div className="prompt-chips">
        {prompts.map((prompt, i) => <button key={prompt} onClick={() => setPromptText(prompt)} className={`prompt-chip-button ${promptText === prompt ? 'selected' : ''}`} data-testid={`button-prompt-${i + 1}`}>{prompt}</button>)}
      </div>
    </section>

    <section className="comparison">
      <div className="compare-title"><div><div className="eyebrow">SIMULATED AGENT · SHARED FIXTURE</div><h2>Two phone interfaces</h2></div><div className="prompt-chip"><span className="chip-dot" /> {promptText}</div></div>
      {runnerError && <div className="error-banner" role="alert" data-testid="status-runner-error"><CircleHelp size={17} />{runnerError}</div>}
      <div className="route-grid">
        <article className="route-panel chat-panel">
          <header className="route-header"><div className="route-symbol text-symbol"><Sparkles size={18} /></div><div><div className="route-overline">ROUTE A <span className="route-divider">/</span> AGENT CHAT</div><h3>Prompt and agent log</h3></div><span className="simulation-tag">SIMULATED AGENT</span></header>
          <div className="chat-phone-stage">
            <div className="phone-shell">
              <div className="phone-camera" />
              <div className="phone-screen chat-phone-screen">
                <div className="phone-status"><span>9:41</span><span><Signal size={13} /> <span className="signal-bars">▮▮▮</span></span></div>
                <div className="chat-contact"><span className="mini-mark">Q</span><span><b>Qurus agent</b><small>SIMULATED · NO LLM</small></span></div>
                <div className="chat-history" data-testid="text-agent-chat">
                  {lastTextPrompt ? <div className="chat-message user-message">{lastTextPrompt}</div> : <div className="chat-welcome"><Sparkles size={18} /><span>Type a library task below. The agent’s actual run log will appear here.</span></div>}
                  {agentResults.text?.log.map((entry, i) => <div className={`chat-message agent-message log-${entry.kind}`} key={`${i}-${entry.message}`} data-testid={`chat-log-${i}`}>{entry.message}</div>)}
                  {runAgent.isPending && lastTextPrompt && <div className="typing-bubble" aria-label="Agent is processing"><i /><i /><i /></div>}
                  {agentResults.text && <div className={`chat-verification ${agentResults.text.verification.passed ? 'passed' : 'not-passed'}`} data-testid="chat-verification">{agentResults.text.verification.passed ? 'VERIFIED' : 'NOT VERIFIED'} · {agentResults.text.verification.message}</div>}
                  {sessionError && <div className="chat-inline-error" role="alert" data-testid="status-text-session-error">{sessionError}</div>}
                </div>
              </div>
              <div className="phone-home" />
            </div>
          </div>
          <form className="chat-compose" onSubmit={event => { event.preventDefault(); run('text'); }}>
            <textarea value={promptText} onChange={event => setPromptText(event.target.value)} placeholder="Ask Shelf to renew, reserve, cancel, or check a due date…" rows={2} aria-label="Library task prompt" data-testid="input-agent-prompt" />
            <button className="button button-primary" type="submit" disabled={runAgent.isPending || !promptText.trim()} data-testid="button-run-text-agent">{runAgent.isPending ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Send to text route</button>
          </form>
          <div className="chat-footnote">Agent decisions are scripted for this demo; no model or API key is connected.</div>
        </article>

        <article className="route-panel keypad-panel">
          <header className="route-header"><div className="route-symbol web-symbol"><Smartphone size={18} /></div><div><div className="route-overline">ROUTE A <span className="route-divider">/</span> MENU INTERACTION</div><h3>Text-menu phone</h3></div><span className="simulation-tag">WEB SIMULATION</span></header>
          <div className="phone-stage">
            <div className="phone-shell keypad-phone">
              <div className="phone-camera" />
              <div className="phone-screen">
                <div className="phone-status"><span>9:41</span><span><Signal size={13} /> <span className="signal-bars">▮▮▮</span></span></div>
                <div className="phone-brand"><span className="mini-mark">S</span> SHELF <span>TEXT SERVICE</span></div>
                <div className="phone-display" data-testid="text-text-menu">
                  <span className="screen-caption">{phoneFrame.digit ? `AGENT INPUT · ${phoneFrame.digit}` : textSession ? `SESSION ${textSession.sessionId.slice(0, 8)}` : 'TEXT MENU'}</span>
                  {phoneFrame.typing ? <div className="menu-typing" aria-label="Menu is typing"><i /><i /><i /></div> : <pre>{textSession && !agentResults.text ? textSession.menu : phoneFrame.menu}</pre>}
                  {phoneFrame.error && <p className="screen-error">{phoneFrame.error}</p>}
                  {textSession?.result && !agentResults.text && <div className="screen-receipt"><b>{textSession.result.receipt.operation}</b><span>{textSession.result.receipt.message}</span><small>Receipt {textSession.result.receipt.id}</small></div>}
                </div>
                <div className="phone-input"><span>{phoneFrame.digit || 'Waiting for agent input'}</span><span className="cursor" /></div>
                <div className="keypad">
                  {['1','2','3','4','5','6','7','8','9','*','0','#'].map(key => <button key={key} className="key" onClick={() => pressDigit(key)} disabled={!textSession || textSession.ended || inputText.isPending || phoneFrame.typing} data-testid={`button-key-${key === '*' ? 'star' : key === '#' ? 'hash' : key}`}>{key}</button>)}
                </div>
              </div>
              <div className="phone-home" />
            </div>
          </div>
          <div className="route-actions">
            <button className="button button-quiet" onClick={beginText} disabled={startText.isPending} data-testid="button-start-text-session">{startText.isPending ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}Start manual session</button>
            <span className="keypad-explain">The simulated agent dials *123# and presses menu digits above.</span>
          </div>
          {sessionError && <div className="inline-error" role="alert" data-testid="status-text-session-error">{sessionError}</div>}
          {textSession && <div className={`session-state ${textSession.error ? 'has-error' : ''}`} data-testid="status-text-session"><span>API SESSION</span><b>{textSession.screen.replace('_', ' ').toUpperCase()}</b><span>{textSession.ended ? 'ENDED' : 'ACTIVE'}</span></div>}
        </article>
      </div>
    </section>

  </main>
  <ShelfLibrary embedded prompt={promptText} onRunWeb={() => run('web')} webResult={agentResults.web} webPending={runAgent.isPending} />
  <section className="page usage-section">
    <div className="usage-intro"><div className="eyebrow">TRANSPARENCY, NOT TELEMETRY</div><h2>Model usage, with context.</h2><p>No model is connected. Token counts and cost are simulated estimates; the elapsed value is the measured duration of the local simulation only.</p><button className="reset-link" onClick={() => { setAgentResults({}); setLastTextPrompt(''); setTextSession(null); setSessionError(''); setRunnerError(''); setPhoneFrame({ menu: 'Start a text session or run a prompt to see the API menu.', digit: '', typing: false, error: '' }); reset.mutate(undefined, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetLibraryStateQueryKey() }), onError: e => setRunnerError(errorMessage(e)) }); }} disabled={reset.isPending} data-testid="button-reset-fixture">{reset.isPending ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Reset fixture state</button></div>
    <div className="usage-columns"><UsageCard title="TEXT-MENU PHONE" result={agentResults.text} testId="usage-text" /><UsageCard title="VISUAL WEBSITE" result={agentResults.web} testId="usage-web" /></div>
  </section>
  </>;
}

function AgentOutput({ result, route }: { result?: AgentRunResult; route: string }) {
  if (!result) return <div className="agent-empty" data-testid={`agent-log-${route}`}><Sparkles size={15} /><span>Agent log appears here after a run. No transcript is pre-filled.</span></div>;
  return <div className="agent-output" data-testid={`agent-log-${route}`}>
    <div className="agent-result-head"><span className="agent-result-label">SIMULATED AGENT LOG <span className="run-id">{result.runId}</span></span><span className={`run-status status-${result.status}`} data-testid={`status-agent-${route}`}>{result.status}</span></div>
    <div className="log-list">{result.log.map((entry, i) => <div key={`${i}-${entry.message}`} className={`log-entry log-${entry.kind}`} data-testid={`log-${route}-${i}`}><span className="log-mark">{entry.kind === 'success' ? '✓' : entry.kind === 'error' ? '!' : entry.kind === 'action' ? '→' : '·'}</span><span>{entry.message}</span></div>)}</div>
    <div className={`verification ${result.verification.passed ? 'passed' : 'not-passed'}`} data-testid={`verification-${route}`}><ShieldCheck size={15} /><span><b>{result.verification.passed ? 'VERIFICATION PASSED' : 'VERIFICATION NOT PASSED'}</b>{result.verification.message}</span></div>
  </div>;
}

function UsageCard({ title, result, testId }: { title: string; result?: AgentRunResult; testId: string }) {
  const usage = result?.usage;
  const values: [string, string][] = usage ? [
    ['Input tokens (simulated estimate)', String(usage.inputTokens)], ['Output tokens (simulated estimate)', String(usage.outputTokens)],
    ['Model calls (actual)', String(usage.modelCalls)], ['Simulation runtime (measured)', `${usage.elapsedMs} ms`],
    ['Cost (simulated estimate)', `$${usage.estimatedCostUsd.toFixed(4)}`],
  ] : [];
  return <article className="usage-card" data-testid={testId}>
    <div className="usage-card-head"><span>{title}</span><span className="simulated-stamp">SIMULATED</span></div>
    {!result ? <div className="no-measurement" data-testid={`${testId}-empty`}><span className="no-measurement-mark">—</span><span><b>No measurement yet</b><small>Run this route to reveal its stub metrics.</small></span></div> : <>
      <div className="sim-warning"><CircleHelp size={13} /> Token and cost figures are estimates. Runtime measures the simulator, not a model.</div>
      <div className="usage-metrics">{values.map(([label, value]) => <div className="usage-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="usage-foot">Run <span>{result.runId}</span> · status {result.status}</div>
    </>}
  </article>;
}

function ShelfLibrary({
  embedded = false,
  prompt = '',
  onRunWeb,
  webResult,
  webPending = false,
}: {
  embedded?: boolean;
  prompt?: string;
  onRunWeb?: () => void;
  webResult?: AgentRunResult;
  webPending?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: state, isLoading, isError, error, refetch } = useGetLibraryState();
  const reserve = useReserveTitle();
  const renew = useRenewLoan();
  const cancel = useCancelHold();
  const reset = useResetLibrary();
  const [search, setSearch] = useState('');
  const [dueBook, setDueBook] = useState('');
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [actionError, setActionError] = useState('');
  const dueDateQuery = useReadDueDate(dueBook, { query: { enabled: Boolean(dueBook), queryKey: getReadDueDateQueryKey(dueBook) } });
  const books = state?.books ?? [];
  const visibleBooks = books.filter(book => `${book.title} ${book.author} ${book.genre}`.toLowerCase().includes(search.toLowerCase()));
  const title = (bookId: string) => books.find(book => book.id === bookId)?.title ?? bookId;
  function refresh() { queryClient.invalidateQueries({ queryKey: getGetLibraryStateQueryKey() }); }
  function doAction(fn: (opts: { data: { bookId: string; idempotencyKey: string } }, options: { onSuccess: (data: ActionResult) => void; onError: (e: unknown) => void }) => void, bookId: string) {
    setActionError('');
    fn({ data: { bookId, idempotencyKey: makeKey() } }, { onSuccess: data => { setActionResult(data); refresh(); }, onError: e => setActionError(errorMessage(e)) });
  }
  return <main className={`page library-page ${embedded ? 'embedded-library' : ''}`}>
    {embedded && <section className="visual-run-heading" data-testid="visual-web-section"><div><div className="eyebrow">ROUTE B / NORMAL WEBSITE</div><h2>Now do the same task in Shelf.</h2><p>The catalog, loans, and holds below are the working visual interface backed by the same records.</p><div className="visual-task"><span>SHARED PROMPT</span><b>{prompt}</b></div></div><button className="button button-primary" onClick={onRunWeb} disabled={!prompt.trim() || webPending} data-testid="button-run-web-agent">{webPending ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Run same prompt through website</button></section>}
    {!embedded && <div className="library-heading">
      <div><div className="eyebrow"><span className="eyebrow-line" /> THE FICTIONAL CATALOG <span className="eyebrow-count">SHELF / LIBRARY</span></div><h1>A library built<br /><em>for real actions.</em></h1><p className="library-lede">Browse the demo collection, inspect loans and holds, and make changes to the same state used in the comparison runner.</p></div>
      <div className="reader-card"><div className="reader-avatar">{state?.user.displayName.slice(0, 1) ?? 'R'}</div><div><span className="reader-label">SIGNED IN AS</span><b data-testid="text-library-user">{state?.user.displayName ?? (isLoading ? 'Loading reader…' : 'Demo reader')}</b><small>{state?.user.id ?? 'SHELF READER'}</small></div></div>
    </div>}
    {embedded && <AgentOutput result={webResult} route="web" />}
    {isError && <div className="error-banner library-error" role="alert" data-testid="error-library"><CircleHelp size={17} />Unable to load Shelf state: {errorMessage(error)} <button className="text-button" onClick={() => refetch()} data-testid="button-retry-library">Retry</button></div>}
    {actionError && <div className="error-banner" role="alert" data-testid="error-library-action"><CircleHelp size={17} />Action failed: {actionError}</div>}
    {isLoading && <div className="skeleton-wrap" data-testid="status-library-loading"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /></div>}
    {!isLoading && state && <>
      <div className="library-stats">
        <div><span>CATALOG</span><strong data-testid="state-book-count">{books.length}</strong><small>titles in fixture</small></div>
        <div><span>ON LOAN</span><strong data-testid="state-loan-count">{state.loans.length}</strong><small>active checkouts</small></div>
        <div><span>HOLDS</span><strong data-testid="state-hold-count">{state.holds.filter(h => h.active).length}</strong><small>active reservations</small></div>
        <button className="button button-quiet reset-library" onClick={() => reset.mutate(undefined, { onSuccess: () => { setActionResult(null); refresh(); }, onError: e => setActionError(errorMessage(e)) })} disabled={reset.isPending} data-testid="button-reset-library">{reset.isPending ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />} Reset fixture</button>
      </div>
      <div className="library-content-grid">
        <section className="catalog-section">
          <div className="catalog-top"><div><div className="eyebrow">01 / COLLECTION</div><h2>Browse the shelves</h2></div><label className="search-box"><Search size={16} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Title, author, genre" aria-label="Search catalog" data-testid="input-catalog-search" /><kbd>/</kbd></label></div>
          {visibleBooks.length === 0 ? <div className="empty-state" data-testid="empty-catalog"><BookOpen size={22} /><b>No titles match that search.</b><span>Try another title, author, or genre.</span></div> :
            <div className="book-list">{visibleBooks.map((book, index) => {
              const onHold = state.holds.some(h => h.bookId === book.id && h.active);
              return <article className="book-row" key={book.id} data-testid={`book-row-${book.id}`}><div className={`book-spine spine-${index % 4}`}><BookOpen size={17} /></div><div className="book-details"><span className="book-genre">{book.genre}</span><h3>{book.title}</h3><p>{book.author}</p></div><span className={`availability availability-${book.availability}`} data-testid={`status-availability-${book.id}`}><i />{book.availability.replace('_', ' ')}</span><div className="book-action">{book.availability === 'available' && !onHold ? <button className="small-action" onClick={() => doAction(reserve.mutate, book.id)} disabled={reserve.isPending} data-testid={`button-reserve-${book.id}`}>Place hold <ArrowRight size={13} /></button> : onHold ? <span className="quiet-state">On your holds</span> : <span className="quiet-state">Not available</span>}</div></article>;
            })}</div>}
        </section>
        <aside className="side-stack">
          <section className="side-card loans-card"><div className="side-title"><div><div className="eyebrow">02 / CHECKOUTS</div><h2>Your loans</h2></div><span className="side-count">{state.loans.length}</span></div>
            {state.loans.length === 0 ? <div className="mini-empty" data-testid="empty-loans"><Clock3 size={18} /><span>No active loans in this fixture.</span></div> : state.loans.map(loan => <div className="loan-item" key={loan.id} data-testid={`loan-row-${loan.id}`}><div><b>{title(loan.bookId)}</b><span>Due {displayDate(loan.dueDate)} · {loan.renewalsUsed}/{loan.renewalLimit} renewals used</span>{loan.renewalBlockedReason && <small className="blocked-note">{loan.renewalBlockedReason}</small>}</div><button className="mini-icon-button" onClick={() => setDueBook(loan.bookId)} aria-label={`Read due date for ${title(loan.bookId)}`} data-testid={`button-due-${loan.bookId}`}><Clock3 size={15} /></button><button className="small-action loan-renew" onClick={() => doAction(renew.mutate, loan.bookId)} disabled={renew.isPending || Boolean(loan.renewalBlockedReason)} data-testid={`button-renew-${loan.bookId}`}>Renew</button></div>)}
            {dueBook && <div className="due-readout" data-testid="status-due-date"><div><span>DUE-DATE LOOKUP</span><button className="bare-icon" onClick={() => setDueBook('')} aria-label="Close due date"><X size={14} /></button></div>{dueDateQuery.isLoading ? 'Reading…' : dueDateQuery.isError ? `Lookup error: ${errorMessage(dueDateQuery.error)}` : dueDateQuery.data ? <><b>{dueDateQuery.data.title}</b><span>{displayDate(dueDateQuery.data.dueDate)}</span><small>{dueDateQuery.data.receipt.message}</small></> : null}</div>}
          </section>
          <section className="side-card holds-card"><div className="side-title"><div><div className="eyebrow">03 / QUEUE</div><h2>Your holds</h2></div><span className="side-count">{state.holds.filter(h => h.active).length}</span></div>
            {state.holds.filter(h => h.active).length === 0 ? <div className="mini-empty" data-testid="empty-holds"><LibraryBig size={18} /><span>No active holds. Reserve an available title to begin.</span></div> : state.holds.filter(h => h.active).map(hold => <div className="hold-item" key={hold.id} data-testid={`hold-row-${hold.id}`}><div><b>{title(hold.bookId)}</b><span>Placed {displayDate(hold.placedAt)}</span></div><button className="small-action cancel-action" onClick={() => { setActionError(''); cancel.mutate({ data: { holdId: hold.id, idempotencyKey: makeKey() } }, { onSuccess: data => { setActionResult(data); refresh(); }, onError: e => setActionError(errorMessage(e)) }); }} disabled={cancel.isPending} data-testid={`button-cancel-hold-${hold.id}`}>Cancel <X size={13} /></button></div>)}
          </section>
        </aside>
      </div>
      {actionResult && <section className="receipt-panel" data-testid="status-action-receipt"><div className="receipt-icon"><Check size={17} /></div><div><span>API RECEIPT · {actionResult.receipt.operation}</span><b>{actionResult.receipt.message}</b><small>Receipt {actionResult.receipt.id} · {displayDateTime(actionResult.receipt.createdAt)}{actionResult.idempotentReplay ? ' · Idempotent replay' : ''}</small></div><button className="bare-icon" onClick={() => setActionResult(null)} aria-label="Dismiss receipt"><X size={16} /></button></section>}
    </>}
    <div className="library-footnote"><span><ShieldCheck size={15} /> API-backed fixture state</span><span>Actions return receipts; displayed state refreshes from Shelf.</span></div>
  </main>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/"><Shell><Runner /></Shell></Route><Route path="/library"><Shell><ShelfLibrary /></Shell></Route><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
