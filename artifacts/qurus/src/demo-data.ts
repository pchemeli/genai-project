
export type DemoUsageData = {
  reply: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  credits: number;
};

export type TextMenuOption = {
  key: string;
  label: string;
};

export type TextMenuScreen = {
  title: string;
  options: TextMenuOption[];
  choice: string | null;
};

export type DemoTextRoute = DemoUsageData & {
  menus: TextMenuScreen[];
};

export type DemoVisualRoute = DemoUsageData & {
  steps: string[];
};

export type DemoPrompt = {
  id: string;
  prompt: string;
  text: DemoTextRoute;
  visual: DemoVisualRoute;
  refused?: boolean;
};

export const ussdCode = '*123#';

const homeMenu = (choice: string | null): TextMenuScreen => ({
  title: 'WATCHLIST HOME',
  options: [
    { key: '1', label: 'Continue watching' },
    { key: '2', label: 'My watchlist' },
    { key: '3', label: 'Browse titles' },
    { key: '4', label: 'Account settings' },
    { key: '9', label: 'End session' },
  ],
  choice,
});

export const demos: DemoPrompt[] = [
  {
    id: 'frieren',
    prompt: 'Add Frieren to my watchlist.',
    text: {
      menus: [
        homeMenu('3'),
        {
          title: 'BROWSE TITLES',
          options: [
            { key: '1', label: 'Search titles' },
            { key: '2', label: 'Popular this week' },
            { key: '0', label: 'Back' },
          ],
          choice: '1',
        },
        {
          title: 'SEARCH RESULTS',
          options: [
            { key: '1', label: 'Frieren' },
            { key: '2', label: 'Fruits Basket' },
            { key: '0', label: 'Back' },
          ],
          choice: '1',
        },
        {
          title: 'ADD TO WATCHLIST',
          options: [
            { key: '1', label: 'Confirm · Frieren' },
            { key: '0', label: 'Back' },
          ],
          choice: '1',
        },
      ],
      reply: 'Frieren is now on your watchlist.',
      inputTokens: 58,
      outputTokens: 19,
      calls: 2,
      credits: 4,
    },
    visual: {
      steps: [
        'Open Watchlist',
        'Find Frieren in Discover',
        'Select “Add to list”',
        'Confirm · Frieren saved',
      ],
      reply: 'Frieren added to the fictional watchlist.',
      inputTokens: 620,
      outputTokens: 22,
      calls: 3,
      credits: 13,
    },
  },
  {
    id: 'continue',
    prompt: 'Continue Jujutsu Kaisen from episode 12.',
    text: {
      menus: [
        homeMenu('1'),
        {
          title: 'CONTINUE WATCHING',
          options: [
            { key: '1', label: 'Jujutsu Kaisen · Episode 12' },
            { key: '2', label: 'Spy x Family · Episode 3' },
            { key: '0', label: 'Back' },
          ],
          choice: '1',
        },
        {
          title: 'RESUME PLAYBACK',
          options: [
            { key: '1', label: 'Resume · Episode 12' },
            { key: '0', label: 'Back' },
          ],
          choice: '1',
        },
      ],
      reply: 'Resuming Jujutsu Kaisen at episode 12.',
      inputTokens: 72,
      outputTokens: 21,
      calls: 2,
      credits: 5,
    },
    visual: {
      steps: [
        'Open the Jujutsu Kaisen row',
        'Read progress · Episode 12',
        'Select “Continue”',
      ],
      reply: 'Playback would continue at episode 12 in this scripted example.',
      inputTokens: 790,
      outputTokens: 28,
      calls: 4,
      credits: 17,
    },
  },
  {
    id: 'renewal',
    prompt: 'Cancel my subscription renewal.',
    text: {
      menus: [
        homeMenu('4'),
        {
          title: 'ACCOUNT SETTINGS',
          options: [
            { key: '1', label: 'Renewal settings' },
            { key: '2', label: 'Profile preferences' },
            { key: '0', label: 'Back' },
          ],
          choice: '1',
        },
        {
          title: 'RENEWAL SETTINGS',
          options: [
            { key: '1', label: 'Turn renewal off' },
            { key: '2', label: 'Keep renewal on' },
            { key: '0', label: 'Back' },
          ],
          choice: '1',
        },
      ],
      reply:
        'Fictional renewal is marked off. No payment or account service was contacted.',
      inputTokens: 60,
      outputTokens: 19,
      calls: 2,
      credits: 4,
    },
    visual: {
      steps: [
        'Open fictional account settings',
        'Choose “Renewal: on”',
        'Select “Turn renewal off”',
      ],
      reply:
        'Renewal marked off in demo data only. No subscription service was contacted.',
      inputTokens: 650,
      outputTokens: 24,
      calls: 3,
      credits: 14,
    },
  },
  {
    id: 'list',
    prompt: 'What is on my watchlist?',
    text: {
      menus: [
        homeMenu('2'),
        {
          title: 'MY WATCHLIST',
          options: [
            { key: '1', label: 'Jujutsu Kaisen · Episode 12' },
            { key: '2', label: 'Spy x Family · Episode 3' },
            { key: '3', label: 'Mob Psycho 100 · Episode 4' },
            { key: '0', label: 'Back' },
          ],
          choice: '0',
        },
      ],
      reply:
        'Jujutsu Kaisen (episode 12), Spy x Family (episode 3), and Mob Psycho 100 (episode 4).',
      inputTokens: 44,
      outputTokens: 23,
      calls: 1,
      credits: 3,
    },
    visual: {
      steps: [
        'Open “My list”',
        'Read the three visible titles and progress',
      ],
      reply:
        'Your list: Jujutsu Kaisen, Spy x Family, and Mob Psycho 100.',
      inputTokens: 590,
      outputTokens: 19,
      calls: 2,
      credits: 12,
    },
  },
  {
    id: 'premium',
    prompt: 'Buy me a premium plan.',
    refused: true,
    text: {
      menus: [
        homeMenu('4'),
        {
          title: 'ACCOUNT SETTINGS',
          options: [
            { key: '1', label: 'Renewal settings' },
            { key: '2', label: 'Profile preferences' },
            { key: '0', label: 'Back' },
          ],
          choice: null,
        },
      ],
      reply:
        'I can’t buy a plan here. This demo has no checkout or payment connection.',
      inputTokens: 39,
      outputTokens: 20,
      calls: 1,
      credits: 2,
    },
    visual: {
      steps: [
        'Inspect the fictional Watchlist screen',
        'No purchase control is available',
        'Refuse without changing data',
      ],
      reply:
        'Premium purchases are unsupported. No purchase or account change was made.',
      inputTokens: 520,
      outputTokens: 17,
      calls: 2,
      credits: 11,
    },
  },
  {
    id: 'delete',
    prompt: 'Delete my account.',
    refused: true,
    text: {
      menus: [
        homeMenu('4'),
        {
          title: 'ACCOUNT SETTINGS',
          options: [
            { key: '1', label: 'Renewal settings' },
            { key: '2', label: 'Profile preferences' },
            { key: '0', label: 'Back' },
          ],
          choice: null,
        },
      ],
      reply:
        'I can’t delete accounts in this demo. No account data was changed.',
      inputTokens: 41,
      outputTokens: 22,
      calls: 1,
      credits: 2,
    },
    visual: {
      steps: [
        'Open the fictional profile screen',
        'No deletion control is available',
        'Refuse without changing data',
      ],
      reply:
        'Account deletion is unsupported. No account data was changed.',
      inputTokens: 570,
      outputTokens: 18,
      calls: 2,
      credits: 12,
    },
  },
];

