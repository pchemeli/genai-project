
import assert from 'node:assert/strict';

import {
  demos,
  ussdCode,
  type DemoPrompt,
  type DemoUsageData,
} from '../artifacts/qurus/src/demo-data.ts';

type RouteName = 'text' | 'visual';

type FictionalState = {
  watchlist: string[];
  renewalEnabled: boolean;
  playbackEpisode: number | null;
  premiumPurchased: boolean;
  accountDeleted: boolean;
};

type RouteResult = {
  reply: string;
  refused: boolean;
  stateChangesSent: number;
  state: FictionalState;
  usage: {
    inputTokens: number;
    outputTokens: number;
    calls: number;
    credits: number;
  };
  history: string[];
};

type ExpectedScenario = {
  textReply: string;
  visualReply: string;
  textCounters: [number, number, number, number];
  visualCounters: [number, number, number, number];
  refused: boolean;
};

/*
 * Independent expected results.
 *
 * Counter order:
 * [inputTokens, outputTokens, calls, credits]
 *
 * These snapshots prevent a changed value in demo-data.ts
 * from silently becoming its own test expectation.
 */
const expected: Record<string, ExpectedScenario> = {
  frieren: {
    textReply: 'Frieren is now on your watchlist.',
    visualReply:
      'Frieren added to the fictional watchlist.',
    textCounters: [58, 19, 2, 4],
    visualCounters: [620, 22, 3, 13],
    refused: false,
  },

  continue: {
    textReply:
      'Resuming Jujutsu Kaisen at episode 12.',
    visualReply:
      'Playback would continue at episode 12 in this scripted example.',
    textCounters: [72, 21, 2, 5],
    visualCounters: [790, 28, 4, 17],
    refused: false,
  },

  renewal: {
    textReply:
      'Fictional renewal is marked off. No payment or account service was contacted.',
    visualReply:
      'Renewal marked off in demo data only. No subscription service was contacted.',
    textCounters: [60, 19, 2, 4],
    visualCounters: [650, 24, 3, 14],
    refused: false,
  },

  list: {
    textReply:
      'Jujutsu Kaisen (episode 12), Spy x Family (episode 3), and Mob Psycho 100 (episode 4).',
    visualReply:
      'Your list: Jujutsu Kaisen, Spy x Family, and Mob Psycho 100.',
    textCounters: [44, 23, 1, 3],
    visualCounters: [590, 19, 2, 12],
    refused: false,
  },

  premium: {
    textReply:
      'I can’t buy a plan here. This demo has no checkout or payment connection.',
    visualReply:
      'Premium purchases are unsupported. No purchase or account change was made.',
    textCounters: [39, 20, 1, 2],
    visualCounters: [520, 17, 2, 11],
    refused: true,
  },

  delete: {
    textReply:
      'I can’t delete accounts in this demo. No account data was changed.',
    visualReply:
      'Account deletion is unsupported. No account data was changed.',
    textCounters: [41, 22, 1, 2],
    visualCounters: [570, 18, 2, 12],
    refused: true,
  },
};

function freshState(): FictionalState {
  return {
    watchlist: [
      'Jujutsu Kaisen',
      'Spy x Family',
      'Mob Psycho 100',
    ],
    renewalEnabled: true,
    playbackEpisode: null,
    premiumPurchased: false,
    accountDeleted: false,
  };
}

function snapshot(state: FictionalState): string {
  return JSON.stringify(state);
}

function usageOf(route: DemoUsageData) {
  return {
    inputTokens: route.inputTokens,
    outputTokens: route.outputTokens,
    calls: route.calls,
    credits: route.credits,
  };
}

function counterTuple(
  usage: ReturnType<typeof usageOf>,
): [number, number, number, number] {
  return [
    usage.inputTokens,
    usage.outputTokens,
    usage.calls,
    usage.credits,
  ];
}

/*
 * Apply only the three fictional successful actions.
 *
 * Refusals and read-only scenarios never call this
 * function. No external action is performed.
 */
function applyFictionalAction(
  id: string,
  state: FictionalState,
): number {
  switch (id) {
    case 'frieren':
      if (!state.watchlist.includes('Frieren')) {
        state.watchlist.push('Frieren');
      }
      return 1;

    case 'continue':
      state.playbackEpisode = 12;
      return 1;

    case 'renewal':
      state.renewalEnabled = false;
      return 1;

    default:
      return 0;
  }
}

/*
 * Walk the text / USSD route.
 *
 * The test enters every service-code character,
 * opens every scripted menu, and sends every
 * non-null scripted choice.
 *
 * Null choice means the menu ends in a refusal
 * without sending a state-changing response.
 */
function runTextRoute(
  demo: DemoPrompt,
  state: FictionalState,
): RouteResult {
  const history: string[] = [];

  let dialEntry = '';

  for (const character of ussdCode) {
    dialEntry += character;
    history.push(`Type ${character}`);
  }

  assert.equal(
    dialEntry,
    '*123#',
    'USSD service code was not entered correctly',
  );

  history.push(`Dialed ${dialEntry}`);

  let refused = false;
  let finalReached = false;
  let stateChangesSent = 0;

  assert.ok(
    demo.text.menus.length > 0,
    'Text route has no menus',
  );

  for (
    let menuIndex = 0;
    menuIndex < demo.text.menus.length;
    menuIndex += 1
  ) {
    const menu = demo.text.menus[menuIndex];

    assert.ok(
      menu.title.trim().length > 0,
      'Menu title is missing',
    );

    assert.ok(
      menu.options.length > 0,
      `${menu.title} has no options`,
    );

    history.push(`Menu opened · ${menu.title}`);

    // Read each option before choosing.
    for (const option of menu.options) {
      assert.ok(
        option.key.length > 0 &&
        option.label.length > 0,
        `Invalid option in ${menu.title}`,
      );

      history.push(
        `Option ${option.key} · ${option.label}`,
      );
    }

    const choice = menu.choice;

    if (choice === null) {
      assert.equal(
        menuIndex,
        demo.text.menus.length - 1,
        'A refusal must terminate the text route',
      );

      refused = true;
      finalReached = true;

      history.push(
        'No matching option · no change sent',
      );

      break;
    }

    const selectedOption = menu.options.find(
      option => option.key === choice,
    );

    assert.ok(
      selectedOption,
      `Choice ${choice} is missing from ${menu.title}`,
    );

    let typedChoice = '';

    for (const character of choice) {
      typedChoice += character;
      history.push(`Type choice ${character}`);
    }

    assert.equal(
      typedChoice,
      choice,
      'Typed menu choice differs from the script',
    );

    history.push(
      `Reply sent · ${choice} ${selectedOption.label}`,
    );

    if (menuIndex === demo.text.menus.length - 1) {
      finalReached = true;

      if (!demo.refused) {
        stateChangesSent += applyFictionalAction(
          demo.id,
          state,
        );
      }
    }
  }

  assert.ok(
    finalReached,
    'Text route did not reach a final state',
  );

  return {
    reply: demo.text.reply,
    refused,
    stateChangesSent,
    state,
    usage: usageOf(demo.text),
    history,
  };
}

/*
 * Reveal all visual steps in sequence.
 *
 * A refusal requires a final explicit refusal step
 * and must not send any fictional state change.
 */
function runVisualRoute(
  demo: DemoPrompt,
  state: FictionalState,
): RouteResult {
  const history: string[] = [];

  let visibleSteps = 0;

  assert.ok(
    demo.visual.steps.length > 0,
    'Visual route has no steps',
  );

  for (const step of demo.visual.steps) {
    assert.ok(
      step.trim().length > 0,
      'Visual route contains an empty step',
    );

    visibleSteps += 1;
    history.push(step);
  }

  assert.equal(
    visibleSteps,
    demo.visual.steps.length,
    'Not all visual steps were revealed',
  );

  const refused = demo.refused === true;

  if (refused) {
    assert.match(
      demo.visual.steps.at(-1) ?? '',
      /refuse without changing data/i,
      'Refusal must end without changing data',
    );
  }

  let stateChangesSent = 0;

  if (!refused) {
    stateChangesSent = applyFictionalAction(
      demo.id,
      state,
    );
  }

  return {
    reply: demo.visual.reply,
    refused,
    stateChangesSent,
    state,
    usage: usageOf(demo.visual),
    history,
  };
}

function checkScenario(
  demo: DemoPrompt,
  previousStates: FictionalState[],
): FictionalState[] {
  const baseline = freshState();
  const initialSnapshot = snapshot(baseline);

  const textState = freshState();
  const visualState = freshState();

  // Each route must begin with its own fresh state.
  assert.notStrictEqual(textState, visualState);
  assert.notStrictEqual(textState, baseline);

  assert.equal(snapshot(textState), initialSnapshot);
  assert.equal(snapshot(visualState), initialSnapshot);

  const text = runTextRoute(demo, textState);
  const visual = runVisualRoute(demo, visualState);

  const want = expected[demo.id];

  assert.ok(
    want,
    `No independent expectations for ${demo.id}`,
  );

  // Both routes must reach exactly their scripted replies.
  assert.equal(text.reply, want.textReply);
  assert.equal(visual.reply, want.visualReply);

  assert.equal(text.reply, demo.text.reply);
  assert.equal(visual.reply, demo.visual.reply);

  // Verify all four fixed counters, not just credits.
  assert.deepEqual(
    counterTuple(text.usage),
    want.textCounters,
    'Text counters differ from expected demo values',
  );

  assert.deepEqual(
    counterTuple(visual.usage),
    want.visualCounters,
    'Visual counters differ from expected demo values',
  );

  assert.deepEqual(
    text.usage,
    usageOf(demo.text),
  );

  assert.deepEqual(
    visual.usage,
    usageOf(demo.visual),
  );

  assert.equal(
    Boolean(demo.refused),
    want.refused,
  );

  assert.equal(text.refused, want.refused);
  assert.equal(visual.refused, want.refused);

  if (want.refused) {
    // Neither route may send a state-changing action.
    assert.equal(text.stateChangesSent, 0);
    assert.equal(visual.stateChangesSent, 0);

    assert.equal(
      snapshot(text.state),
      initialSnapshot,
      'Text refusal changed fictional state',
    );

    assert.equal(
      snapshot(visual.state),
      initialSnapshot,
      'Visual refusal changed fictional state',
    );

    assert.match(
      text.history.at(-1) ?? '',
      /no change sent/i,
    );
  }

  // A read-only watchlist query must not mutate state.
  if (demo.id === 'list') {
    assert.equal(text.stateChangesSent, 0);
    assert.equal(visual.stateChangesSent, 0);
    assert.equal(snapshot(text.state), initialSnapshot);
    assert.equal(snapshot(visual.state), initialSnapshot);
  }

  // Both routes should simulate the same fictional outcome.
  assert.deepEqual(
    text.state,
    visual.state,
    'The two routes ended with different fictional states',
  );

  // Running a route must not mutate its baseline.
  assert.equal(
    snapshot(baseline),
    initialSnapshot,
    'The baseline state changed',
  );

  // A new scenario must start fresh, regardless of
  // the completed state of earlier scenarios.
  const nextFreshState = freshState();

  assert.equal(
    snapshot(nextFreshState),
    initialSnapshot,
    'A new scenario inherited previous state',
  );

  assert.notStrictEqual(nextFreshState, text.state);
  assert.notStrictEqual(nextFreshState, visual.state);

  // Retained previous results must remain unchanged.
  // These snapshots also check that this run did not
  // mutate any earlier scenario's final state.
  for (const previous of previousStates) {
    assert.equal(
      snapshot(previous),
      previousSnapshots.get(previous),
      'Previous scenario state was mutated',
    );
  }

  // Capture completed states for the next isolation check.
  previousSnapshots.set(
    text.state,
    snapshot(text.state),
  );

  previousSnapshots.set(
    visual.state,
    snapshot(visual.state),
  );

  return [
    ...previousStates,
    text.state,
    visual.state,
  ];
}

const previousSnapshots = new WeakMap<
  FictionalState,
  string
>();

function main() {
  let passed = 0;
  let failed = 0;
  let previousStates: FictionalState[] = [];

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  // Detect added, deleted, or duplicated scenario IDs.
  const ids = demos.map(demo => demo.id);

  assert.equal(
    demos.length,
    6,
    'Expected exactly six scenarios',
  );

  assert.equal(
    new Set(ids).size,
    6,
    'Scenario IDs must be unique',
  );

  assert.deepEqual(
    [...ids].sort(),
    Object.keys(expected).sort(),
    'Scenario IDs differ from the expected test set',
  );

  for (const [index, demo] of demos.entries()) {
    const label =
      `Scenario ${index + 1} (${demo.id})`;

    try {
      previousStates = checkScenario(
        demo,
        previousStates,
      );

      passed += 1;

      console.log(
        `[${today}] PASS ${label}` +
        (demo.refused
          ? ' - expected refusal, no changes'
          : ' - both routes complete'),
      );
    } catch (error) {
      failed += 1;

      console.error(
        `[${today}] FAIL ${label}`,
      );

      console.error(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }

  console.log(
    `[${today}] ${passed}/${demos.length} scenarios passed` +
    (failed > 0 ? ` (${failed} failed)` : ''),
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();

