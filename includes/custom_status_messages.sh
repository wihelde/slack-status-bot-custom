# EMOJIs
APPLE_MUSIC_EMOJI=:apple_music:
BREAK_EMOJI=:double_vertical_bar:
DEFAULT_EMOJI=:heads-down:
DOG_EMOJI=:dog2:
FOCUS_EMOJI=:get-shit-done:
HOLIDAY_EMOJI=:palm_tree:
MEETING_EMOJI=:spiral_calendar_pad:
MONDAY_EMOJI=:monday:
OFF_EMOJI=:mobile_phone_off:
THURSDAY_EMOJI=:badger:
ON_EMOJI=(
  ":heart_eyes:"
  ":twisted_rightwards_arrows:"
  ":tropical_fish:"
  ":thumbsup:"
  ":arrow_upper_right:"
  ":brain:"
  ":shark:"
  ":penguin:"
  ":construction:"
  ":question:"
  ":elephant:"
  ":eagle:"
  ":fire:"
  ":deciduous_tree:"
  ":milky_way:"
  ":eyes:"
  ":air:"
  ":clapper:"
  ":bomb:"
  ":duck:"
  ":bulb:"
  ":lion_face:"
  ":exploding_head:"
  ":robot_face:"
  ":heads_down:"
)
SHOPPING_EMOJI=:shopping_trolley:
SICK_EMOJI=:face_with_thermometer:
SKYPE_EMOJI=:skype:
SPORT_EMOJI=:rowboat:
SPOTIFY_EMOJI=:spotify_2:
DEEZER_EMOJI=:deezer:
TEAMS_EMOJI=:teams:
TGIF_EMOJI=:tgif:
ZOOM_EMOJI=:zoom_3:
DISCORD_EMOJI=:discord:

# Messages
BREAK_MESSAGE="Having a break. Having no KitKat."
DOG_MESSAGE="The dog takes me for a walk"
FOCUS_MESSAGE="Focus-mode - please disturb only in urgent cases"
MEETING_MESSAGE="in some non-zoom-meeting"
MONDAY_MESSAGE="Pretty sure I smell a Monday here ..."
THURSDAY_MESSAGE="Happy Donnersdachs!"
ON_MESSAGE=(
  "Love for another person is also always a cost factor"
  "You have only one option: move on, stop or turn back. You can't do both together."
  "You can paint a goldfish like a lion, but when the rain comes, it will show who is the eagle"
  "If you're a real winner, turn November into Yes-vember"
  "When going downhill, just walk backwards"
  "Sometimes your path leads you to crossroads where your life turns 360°."
  "One shark never leaves another out in the cold"
  "Be like a very successful animal!"
  "Avoid problems. They only complicate your life"
  "There will be that one day when some things will be different than they are now. But not today."
  "Problems are like elephants. The smaller they are, the better you can defeat them."
  "An eagle always finds a bridge, no matter how raging the river is."
  "Fire does not ask. Fire does."
  "Holiday ban is climate protection!"
  "If it feels like the whole universe is against you, stay calm. It will have its reasons."
  "If you don't succeed, 99% of the time it's because of yourself or something else."
  "Insider tip: Fresh air. Use it, because it is like oxygen for the body."
  "Life is like a film. It can be very good, but also very bad."
  "Money is like an atomic bomb. Better to have than to need."
  "Most people are like ducks. They have hardly any capital investments."
  "Never make the wrong decision when you should be making the right one."
  "Sheep plan for the future. Lions plan far beyond."
  "The best thoughts originate in the head."
  "There are two types of mistakes you can make in life. Avoid both."
  "Your failure will be less painful later if you stop trying now."
)
OFFLINE_MESSAGE_LIST=(
  "Does this away message really mean I'm away, or am I pretending to be away?"
  "Don't Worry!, I dont know where I am either."
  "I'm not here right now but if you scream really loud into your monitor I might be able to hear you!"
  "Keep staring at the screen and maybe I'll come back."
  "Roses are red - Violets are blue - Some away messages rhyme, and some don't."
  "Sorry, I'm not here right now, but feel free to talk to the computer as long as you like."
)
SHOPPING_MESSAGE="Spending money which I don't have for stuff which I don't need"
SICK_MESSAGE="Out sick"
SKYPE_MESSAGE="in a meeting - most likely Coke-related"
SPORT_MESSAGE="Doing some sport, because I'm fat (limited reachability)"
TEAMS_MESSAGE="in a meeting - most likely Coke-related"
TGIF_MESSAGE="TGIF!"
VACATION_MESSAGE="strong vacationing"

# get random number to pick random online message and related emoji
ORDER=$(((RANDOM % 24) + 0))
ON_MESSAGE_FINAL=${ON_MESSAGE[$ORDER]}
ON_EMOJI_FINAL=${ON_EMOJI[$ORDER]}

# get random offline message
OFFLINE_MESSAGE=${OFFLINE_MESSAGE_LIST[$((RANDOM % ${#OFFLINE_MESSAGE_LIST[@]}))]}