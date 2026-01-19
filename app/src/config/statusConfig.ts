/**
 * Status Configuration
 * All status messages, emojis, and constants from the Bash version
 */

export enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

/**
 * Custom Status Configuration
 * Defines a configurable status with emoji, message, and when it should be used
 */
export interface CustomStatusConfig {
  id: string; // z.B. 'break', 'meeting', 'monday', 'weekday_1', etc.
  emoji: string;
  message: string;
  days: DayOfWeek[]; // [] für Quick Actions ohne automatische Nutzung
  enableDND: boolean;
  presence: 'auto' | 'away';
  quickActionLabel?: string | null; // null = nicht im Dashboard zeigen
  category: 'quick_action' | 'day_based'; // für UI-Gruppierung
}

/**
 * Overridable Status Pattern
 * Defines third-party status patterns that the bot is allowed to override
 */
export interface OverridableStatusPattern {
  emoji: string;
  messagePatterns: string[]; // Exact message matches allowed to override
  description?: string; // e.g., "Officely office booking"
}

/**
 * Overall Status Configuration
 * Container for all custom statuses and overridable patterns
 */
export interface StatusConfiguration {
  customStatuses: CustomStatusConfig[];
  overridablePatterns?: OverridableStatusPattern[];
}

export const STATUS_MESSAGES = {
  // Emojis
  APPLE_MUSIC_EMOJI: ':apple_music:',
  BREAK_EMOJI: ':double_vertical_bar:',
  DOG_EMOJI: ':dog2:',
  FOCUS_EMOJI: ':get-shit-done:',
  HOLIDAY_EMOJI: ':palm_tree:',
  MEETING_EMOJI: ':spiral_calendar_pad:',
  MONDAY_EMOJI: ':monday:',
  OFF_EMOJI: ':mobile_phone_off:',
  OFFICELY_OFFICE: ':office:',
  OFFICELY_HOME: ':house_with_garden:',
  SHOPPING_EMOJI: ':shopping_trolley:',
  SICK_EMOJI: ':face_with_thermometer:',
  SKYPE_EMOJI: ':skype:',
  SPOTIFY_EMOJI: ':spotify_2:',
  TEAMS_EMOJI: ':teams:',
  TGIF_EMOJI: ':tgif:',
  ZOOM_EMOJI: ':zoom_3:',
  DISCORD_EMOJI: ':discord:',
  REMEET_EMOJI: ':remeet:',
  TRAVEL_EMOJI: ':car:',
  PARENTAL_LEAVE_EMOJI: ':baby:',
  CHILD_DOC_EMOJI: ':baby:',
  HUDDLE_EMOJI: ':headphones:',

  // ON_STATUS_PAIRS: Emoji and message must always go together
  ON_STATUS_PAIRS: [
    { emoji: ':twisted_rightwards_arrows:', message: 'You have only one option: move on, stop or turn back. You can\'t do both together.' },
    { emoji: ':tropical_fish:', message: 'You can paint a goldfish like a lion, but when the rain comes, it will show who is the eagle' },
    { emoji: ':thumbsup:', message: 'If you\'re a real winner, turn November into Yes-vember' },
    { emoji: ':arrow_upper_right:', message: 'When going downhill, just walk backwards' },
    { emoji: ':brain:', message: 'Sometimes your path leads you to crossroads where your life turns 360°.' },
    { emoji: ':shark:', message: 'One shark never leaves another out in the cold' },
    { emoji: ':penguin:', message: 'Be like a very successful animal!' },
    { emoji: ':construction:', message: 'Avoid problems. They only complicate your life' },
    { emoji: ':neutral_face:', message: 'There will be that one day when some things will be different than they are now. But not today.' },
    { emoji: ':elephant:', message: 'Problems are like elephants. The smaller they are, the better you can defeat them.' },
    { emoji: ':eagle:', message: 'An eagle always finds a bridge, no matter how raging the river is.' },
    { emoji: ':fire:', message: 'Fire does not ask. Fire does.' },
    { emoji: ':deciduous_tree:', message: 'Holiday ban is climate protection!' },
    { emoji: ':milky_way:', message: 'If it feels like the whole universe is against you, stay calm. It will have its reasons.' },
    { emoji: ':eyes:', message: 'If you don\'t succeed, 99% of the time it\'s because of yourself or something else.' },
    { emoji: ':air:', message: 'Insider tip: Fresh air. Use it, because it is like oxygen for the body.' },
    { emoji: ':clapper:', message: 'Life is like a film. It can be very good, but also very bad.' },
    { emoji: ':duck:', message: 'Most people are like ducks. They have hardly any capital investments.' },
    { emoji: ':index_pointing_at_the_viewer:', message: 'Never make the wrong decision when you should be making the right one.' },
    { emoji: ':sheep:', message: 'Sheep plan for the future. Lions plan far beyond.' },
    { emoji: ':exploding_head:', message: 'The best thoughts originate in the head.' },
    { emoji: ':bulb:', message: 'The best thoughts originate in the head.' },
    { emoji: ':sunglasses:', message: 'There are two types of mistakes you can make in life. Avoid both.' },
    { emoji: ':sunglasses:', message: 'Why go outside when the sun can shine on your bed?' },
    { emoji: ':older_adult:', message: 'I\'m at an age now where the next day your body whispers in your ear: never do that again.' },
    { emoji: ':potato:', message: 'Some people react confused when a sentence doesn\'t end the way they want it to potato salad.' },
    { emoji: ':panda_face:', message: 'These are not dark circles under the eyes, these are shadows of great actions!' },
    { emoji: ':door:', message: 'There are two words that will open many doors for you in life: pull and push.' },
    { emoji: ':lion_face:', message: 'The lion is the shark among the eagles!' },
    { emoji: ':cucumber:', message: 'The human body consists of 90% water. So we are cucumbers with feelings' },
    { emoji: ':placard:', message: 'Your advertising could be here!' },
    { emoji: ':speak_no_evil:', message: 'I hate people who, in the middle of a sentence....' },
    { emoji: ':muscle:', message: 'Don\'t let ANYONE ruin your day - it\'s YOUR day, ruin it YOURSELF!' },
    { emoji: ':melting_face:', message: 'Another fine day ruined by responsibility' },
    { emoji: ':warning:', message: 'Mistakes are a betrayal of the employer' },
  ],

  // Messages
  BREAK_MESSAGE: 'Having a break. Having no KitKat.',
  DOG_MESSAGE: 'The dog takes me for a walk',
  FOCUS_MESSAGE: 'Focus-mode - please disturb only in urgent cases',
  MEETING_MESSAGE: 'in some offline-meeting - will answer later',
  REMEET_MESSAGE: 'In some remeet-call - will answer later',
  REMEET_VIRTUAL_DESK_MESSAGE: 'At my virtual desk. Come by if you want',
  MONDAY_MESSAGE: 'Pretty sure I smell a Monday here ...',

  OFFLINE_MESSAGE_LIST: [
    'Does this away message really mean I\'m away, or am I pretending to be away?',
    'Don\'t Worry!, I dont know where I am either.',
    'I\'m not here right now but if you scream really loud into your monitor I might be able to hear you!',
    'Keep staring at the screen and maybe I\'ll come back.',
    'Roses are red - Violets are blue - Some away messages rhyme, and some don\'t.',
    'Sorry, I\'m not here right now, but feel free to talk to the computer as long as you like.',
    'My dog ate my away message',
    'I\'ll be back in 5 minutes. If I\'m not back by then, I\'ll be longer.',
    'I\'m not here right now...but if I were... wouldn\'t that be awesome?',
    'I\'m sitting on the TV watching the couch',
    'This away message will provide you with no entertainment, nor information as to where I am.',
    'I\'m currently staring at the back of my eyelids...',
    'My other away message is funny.',
    'One day I will come up with a good away message, but until then, I\'m away!',
    'Out watching the grass grow',
    'I fell out of my chair. This might take a while!',
    'Message Under Construction',
  ],

  SHOPPING_MESSAGE: 'Spending money which I don\'t have for stuff which I don\'t need',
  SICK_MESSAGE: 'Out sick',
  SKYPE_MESSAGE: 'in a meeting - most likely Coke-related',
  TEAMS_MESSAGE: 'in a meeting - most likely Coke-related',
  TGIF_MESSAGE: 'TGIF!',
  VACATION_MESSAGE: 'strong vacationing',
  PARENTAL_LEAVE_MESSAGE: 'strong parenting',
  TRAVEL_MESSAGE: 'On my way to Adventure Land',
  CHILD_DOC_MESSAGE: 'At the pediatrician with the little baby-girl. Will be back soon.',
  HUDDLE_MESSAGE: 'In a huddle ... will answer later',
};

export const POLL_INTERVALS = {
  SPOTIFY: 1000,        // Check every 1 second
  APPLE_MUSIC: 1000,    // Check every 1 second
  ZOOM: 1000,           // Check every 1 second
  TEAMS: 1000,          // Check every 1 second
  HUDDLE: 1000,         // Check every 1 second
  STATUS_CORRECTION: 60000,  // Correct status every 60 seconds
  PRESENCE: 540000,     // Check presence every 9 minutes
};

/**
 * Default Overridable Status Patterns
 * These third-party statuses are allowed to be overridden by the bot
 * Users can extend this list in their config file
 */
export const DEFAULT_OVERRIDABLE_PATTERNS: OverridableStatusPattern[] = [
  {
    emoji: ':office:',
    messagePatterns: [
      'Office Hamburg (via Officely)',
      'Office Belgrade (via Officely)',
    ],
    description: 'Officely office booking status',
  },
  // Add more patterns here as needed
];

/**
 * Get default status configuration
 * Returns the default set of Quick Actions and day-based statuses
 */
export function getDefaultStatusConfiguration(): CustomStatusConfig[] {
  return [
    // Quick Actions
    {
      id: 'break',
      emoji: STATUS_MESSAGES.BREAK_EMOJI,
      message: STATUS_MESSAGES.BREAK_MESSAGE,
      days: [],
      enableDND: false,
      presence: 'auto',
      quickActionLabel: 'Break',
      category: 'quick_action',
    },
    {
      id: 'meeting',
      emoji: STATUS_MESSAGES.MEETING_EMOJI,
      message: STATUS_MESSAGES.MEETING_MESSAGE,
      days: [],
      enableDND: true,
      presence: 'auto',
      quickActionLabel: 'Meeting',
      category: 'quick_action',
    },
    {
      id: 'focus',
      emoji: STATUS_MESSAGES.FOCUS_EMOJI,
      message: STATUS_MESSAGES.FOCUS_MESSAGE,
      days: [],
      enableDND: true,
      presence: 'auto',
      quickActionLabel: 'Focus',
      category: 'quick_action',
    },
    {
      id: 'travel',
      emoji: STATUS_MESSAGES.TRAVEL_EMOJI,
      message: STATUS_MESSAGES.TRAVEL_MESSAGE,
      days: [],
      enableDND: false,
      presence: 'auto',
      quickActionLabel: 'Travel',
      category: 'quick_action',
    },
    {
      id: 'sick',
      emoji: STATUS_MESSAGES.SICK_EMOJI,
      message: STATUS_MESSAGES.SICK_MESSAGE,
      days: [],
      enableDND: false,
      presence: 'away',
      quickActionLabel: 'Sick',
      category: 'quick_action',
    },
    {
      id: 'remeet',
      emoji: STATUS_MESSAGES.REMEET_EMOJI,
      message: STATUS_MESSAGES.REMEET_MESSAGE,
      days: [],
      enableDND: false,
      presence: 'auto',
      quickActionLabel: 'Remeet',
      category: 'quick_action',
    },
    {
      id: 'dog',
      emoji: STATUS_MESSAGES.DOG_EMOJI,
      message: STATUS_MESSAGES.DOG_MESSAGE,
      days: [],
      enableDND: false,
      presence: 'auto',
      quickActionLabel: 'Dog',
      category: 'quick_action',
    },
    {
      id: 'holiday',
      emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
      message: STATUS_MESSAGES.VACATION_MESSAGE,
      days: [],
      enableDND: false,
      presence: 'away',
      quickActionLabel: 'Holiday',
      category: 'quick_action',
    },
    // Day-based: Monday
    {
      id: 'monday',
      emoji: STATUS_MESSAGES.MONDAY_EMOJI,
      message: STATUS_MESSAGES.MONDAY_MESSAGE,
      days: [DayOfWeek.MONDAY],
      enableDND: false,
      presence: 'auto',
      quickActionLabel: null,
      category: 'day_based',
    },
    // Day-based: Friday
    {
      id: 'friday',
      emoji: STATUS_MESSAGES.TGIF_EMOJI,
      message: STATUS_MESSAGES.TGIF_MESSAGE,
      days: [DayOfWeek.FRIDAY],
      enableDND: false,
      presence: 'auto',
      quickActionLabel: null,
      category: 'day_based',
    },
    // Day-based: Online (Tue-Thu) - all ON_STATUS_PAIRS
    ...STATUS_MESSAGES.ON_STATUS_PAIRS.map((pair, i) => ({
      id: `weekday_${i}`,
      emoji: pair.emoji,
      message: pair.message,
      days: [DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY],
      enableDND: false,
      presence: 'auto' as const,
      quickActionLabel: null,
      category: 'day_based' as const,
    })),
  ];
}
