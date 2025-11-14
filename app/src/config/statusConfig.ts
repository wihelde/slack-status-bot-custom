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

  ON_EMOJI: [
    ':twisted_rightwards_arrows:',
    ':tropical_fish:',
    ':thumbsup:',
    ':arrow_upper_right:',
    ':brain:',
    ':shark:',
    ':penguin:',
    ':construction:',
    ':neutral_face:',
    ':elephant:',
    ':eagle:',
    ':fire:',
    ':deciduous_tree:',
    ':milky_way:',
    ':eyes:',
    ':air:',
    ':clapper:',
    ':duck:',
    ':index_pointing_at_the_viewer:',
    ':sheep:',
    ':exploding_head:',
    ':bulb:',
    ':heads-down:',
    ':sunglasses:',
    ':older_adult:',
    ':potato:',
    ':panda_face:',
    ':door:',
    ':lion_face:',
    ':cucumber:',
    ':placard:',
    ':speak_no_evil:',
    ':muscle:',
    ':melting_face:',
    ':warning:',
  ],

  // Messages
  BREAK_MESSAGE: 'Having a break. Having no KitKat.',
  DOG_MESSAGE: 'The dog takes me for a walk',
  FOCUS_MESSAGE: 'Focus-mode - please disturb only in urgent cases',
  MEETING_MESSAGE: 'in some offline-meeting - will answer later',
  REMEET_MESSAGE: 'In some remeet-call - will answer later',
  REMEET_VIRTUAL_DESK_MESSAGE: 'At my virtual desk. Come by if you want',
  MONDAY_MESSAGE: 'Pretty sure I smell a Monday here ...',
  
  ON_MESSAGE: [
    'You have only one option: move on, stop or turn back. You can\'t do both together.',
    'You can paint a goldfish like a lion, but when the rain comes, it will show who is the eagle',
    'If you\'re a real winner, turn November into Yes-vember',
    'When going downhill, just walk backwards',
    'Sometimes your path leads you to crossroads where your life turns 360°.',
    'One shark never leaves another out in the cold',
    'Be like a very successful animal!',
    'Avoid problems. They only complicate your life',
    'There will be that one day when some things will be different than they are now. But not today.',
    'Problems are like elephants. The smaller they are, the better you can defeat them.',
    'An eagle always finds a bridge, no matter how raging the river is.',
    'Fire does not ask. Fire does.',
    'Holiday ban is climate protection!',
    'If it feels like the whole universe is against you, stay calm. It will have its reasons.',
    'If you don\'t succeed, 99% of the time it\'s because of yourself or something else.',
    'Insider tip: Fresh air. Use it, because it is like oxygen for the body.',
    'Life is like a film. It can be very good, but also very bad.',
    'Most people are like ducks. They have hardly any capital investments.',
    'Never make the wrong decision when you should be making the right one.',
    'Sheep plan for the future. Lions plan far beyond.',
    'The best thoughts originate in the head.',
    'There are two types of mistakes you can make in life. Avoid both.',
    'Your failure will be less painful later if you stop trying now.',
    'Why go outside when the sun can shine on your bed?',
    'I\'m at an age now where the next day your body whispers in your ear: never do that again.',
    'Some people react confused when a sentence doesn\'t end the way they want it to potato salad.',
    'These are not dark circles under the eyes, these are shadows of great actions!',
    'There are two words that will open many doors for you in life: pull and push.',
    'The lion is the shark among the eagles!',
    'The human body consists of 90% water. So we are cucumbers with feelings',
  ],

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



