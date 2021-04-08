#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# set PATH for jq as variable to be used in launchd
jq=/usr/local/bin/jq

# define token and emojis to use
[[ ! -f .token ]] && echo "There was no token-file found. Please create a file called .token, include your slack-tokens and define in line 11 in which line your token is present in your token-file!" && exit 1
LEGACY_TOKEN=$(awk 'NR==5' .token)
SPOTIFY_EMOJI=":spotify_2:"
ZOOM_EMOJI=":zoom_3:"
APPLE_EMOJI=":apple_music:"
DEFAULT=:heads-down:
MEETING=:spiral_calendar_pad:
MONDAY=:monday:
TGIF=:tgif:

# define bunch of random online-messages
ON_MESSAGE=( \
  "Sheep plan for the future. Lions plan far beyond." \
  "Life is like a film. It can be very good, but also very bad." \
  "Never make the wrong decision when you should be making the right one." \
  "Your failure will be less painful later if you stop trying now." \
  "An eagle always finds a bridge, no matter how raging the river is." \
  "Insider tip: Fresh air. Use it, because it is like oxygen for the body." \
  "If you don't succeed, 99% of the time it's because of yourself or something else." \
  "There are two types of mistakes you can make in life. Avoid both." \
  "Most people are like ducks. They have hardly any capital investments." \
  "If it feels like the whole universe is against you, stay calm. It will have its reasons." \
  "The best thoughts originate in the head." \
  "Money is like an atomic bomb. Better to have than to need." \
  "Holiday ban is climate protection!" \
  "Fire does not ask. Fire does." \
  )

# define related emojis for random online messages
ON_EMOJI=( \
  ":lion_face:" \
  ":clapper:" \
  ":bulb:" \
  ":heads_down:" \
  ":eagle:" \
  ":lungs:" \
  ":eyes:" \
  ":robot_face:" \
  ":duck:" \
  ":milky_way:" \
  ":exploding_head:" \
  ":bomb:" \
  ":deciduous_tree:" \
  ":fire:" \
)

# get random number to pick random online message and related emoji
ORDER=$(( ( RANDOM % 13 )  + 0 ))
ON_MESSAGE_FINAL=${ON_MESSAGE[$ORDER]}
ON_EMOJI_FINAL=${ON_EMOJI[$ORDER]}

trap onexit INT

# change your slack-status
function setProfile() {
  PAYLOAD=$1
  echo "Calling https://api.slack.com/methods/users.profile.set with $PAYLOAD"
  curl -X POST -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set"
  echo "changed" > .status-bloggerbutze
}

# check if status is clean to be changed
function isStatusClean() {
  echo "Calling https://slack.com/api/users.profile.get ..."
  JSON=$(curl -X GET -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
  echo "$JSON"
  STATUS_EMOJI=$(echo "$JSON" | $jq '.profile.status_emoji' | sed 's/\"//g')
  STATUS_TEXT=$(echo "$JSON" | $jq '.profile.status_text' | sed 's/\"//g')
  echo "Status Emoji: \"$STATUS_EMOJI\""
  echo "Status Text: \"$STATUS_TEXT\""
  [[ " ${ON_EMOJI[*]} " =~ ${STATUS_EMOJI} && " ${ON_MESSAGE[*]} " =~ ${STATUS_TEXT} ]] \
  && echo " -> Status is allowed to change" \
  && return 0
  [[ "$STATUS_EMOJI" == "$SPOTIFY_EMOJI" || "$STATUS_EMOJI" == "$ZOOM_EMOJI" || "$STATUS_EMOJI" == "$APPLE_EMOJI" || "$STATUS_EMOJI" == "$DEFAULT" || "$STATUS_EMOJI" == "$MEETING" || "$STATUS_EMOJI" == "$MONDAY" || "$STATUS_EMOJI" == "$TGIF" ]] \
  && echo " -> Status is allowed to change" \
  && return 0
  [[ "$STATUS_EMOJI" == ":spiral_calendar_pad:" && "$STATUS_TEXT" == "In a meeting • Outlook Calendar" ]] \
  && echo " -> Status is allowed to change" \
  && return 0
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] \
  && echo " -> Status is allowed to change" \
  && return 0
  echo " -> Status is not allowed to change"
  return 1
}

# reset your status to your random default-status; special handling for monday and friday
function reset() {
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] && return 0
  echo 'Resetting status'
  DOW=$(date +%u)
  eval "ON_MESSAGE=\$ON_MESSAGE_$ORDER"
  eval "ON_EMOJI=\$ON_EMOJI_$ORDER"
  [[ $DOW == "1" ]] \
  && PAYLOAD="{ \"profile\": { \"status_text\" : \"Pretty sure I smell a Monday here ...\", \"status_emoji\" : \"$MONDAY\", \"status_expiration\": 0 } }"
  [[ $DOW == "5" ]] \
  && PAYLOAD="{ \"profile\": { \"status_text\" : \"TGIF!\", \"status_emoji\" : \"$TGIF\", \"status_expiration\": 0 } }"
  [[ $DOW != "5" && $DOW != "1" ]] \
  && PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }"
  setProfile "$PAYLOAD"
  echo "reset" > .status-bloggerbutze
}

function onexit() {
  echo 'Exiting'
  isStatusClean && reset
  exit
}

# get artist and song-title from spotify via applescript
function SpotifyGetSong() {
  SPOTIFY_SONG=$(osascript -e 'tell application "Spotify"' -e 'set track_artist to artist of current track' -e 'set track_name to name of current track' -e 'set podcast to album of current track' -e 'if track_artist = "" then' -e 'podcast & " - " & track_name' -e 'else' -e 'track_artist & " - " & track_name' -e 'end if' -e 'end tell')
  SPOTIFY_SONG_LENGTH=${#SPOTIFY_SONG}
  [[ $SPOTIFY_SONG_LENGTH -gt 100 ]] && SPOTIFY_SONG=$(echo "$SPOTIFY_SONG" | sed 's/\(.\{97\}\)./\1.../' | cut -c 1-100)
  echo "$SPOTIFY_SONG"
}

# get artist and song-title from apple Music via applescript
function AppleGetSong() {
  APPLE_SONG=$(osascript -e 'tell application "Music" to artist of current track & " - " & name of current track')
  APPLE_SONG_LENGTH=${#SPOTIFY_SONG}
  [[ $APPLE_SONG_LENGTH -gt 100 ]] && APPLE_SONG=$(echo "$APPLE_SONG" | sed 's/\(.\{97\}\)./\1.../' | cut -c 1-100)
  echo "$APPLE_SONG"
}

# change your status with spotify-infos
function setStatusSpotify() {
  SPOTIFY_SONG=$(SpotifyGetSong)
  echo "Detected Spotify track: $SPOTIFY_SONG"
  [[ "$SPOTIFY_SONG" == "$STATUS_TEXT" ]] && echo "Same Spotify song detected. Call to API will be avoided." && return 0
  echo "Trying to set Slack-Status to your current Spotify-Song"
  PAYLOAD="{ \"profile\": { \"status_text\": \"$SPOTIFY_SONG\", \"status_emoji\": \"$SPOTIFY_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to your current Spotify-Song"
  setProfile "$PAYLOAD"
  echo "changed" > .status-bloggerbutze
}

# change your status with apple music-infos
function setStatusAppleMusic() {
  APPLE_MUSIC_SONG=$(AppleGetSong)
  echo "Detected Apple Music track: $APPLE_MUSIC_SONG"
  [[ "$APPLE_MUSIC_SONG" == "$STATUS_TEXT" ]] && echo "Same Apple Music song detected. Call to API will be avoided." && return 0
  echo "Trying to set Slack-Status to your current Apple Music-Song"
  PAYLOAD="{ \"profile\": { \"status_text\": \"$APPLE_MUSIC_SONG\", \"status_emoji\": \"$APPLE_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to your current Apple Music-Song"
  setProfile "$PAYLOAD"
  echo "changed" > .status-bloggerbutze
}

# change your status when in zoom-call
function setStatusInMeeting() {
  [[ "$ZOOM_EMOJI" == "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  echo "Trying to set your Slack-status to show you started a Zoom-Call"
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \"$ZOOM_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to show you started a Zoom-Call"
  setProfile "$PAYLOAD"
  echo "changed" > .status-bloggerbutze
}

# check if you are  in a meeting
function inAMeeting() {
  lsof -i -P -n 2>&1 | grep zoom | grep UDP > /dev/null
}

# check if spotify is running
function isSpotifyPlaying() {
  [[ "$(pgrep -x 'Spotify')" ]] \
  && SPOTIFY_STATE=$(osascript -e 'if application "Spotify" is running then' -e 'tell application "Spotify" to player state' -e 'end if')
  [[ "$SPOTIFY_STATE" = "playing" ]] && return 0
  return 1
}

# check if apple music is running
function isAppleMusicPlaying() {
  APPLE_MUSIC_STATE=$(osascript -e 'if application "Music" is running then' -e 'tell application "Music" to player state' -e 'end if')
  [[ "$APPLE_MUSIC_STATE" = "playing" ]] && return 0
  return 1
}

# check if status was already reset
statusReset() {
  test ! -f .status-bloggerbutze && return 0
  STATUS=$(cat .status-bloggerbutze)
  [[ "$STATUS" != "reset" ]] && return 0
  return 1
}

# do magic
( ! isSpotifyPlaying && ! isAppleMusicPlaying && ! inAMeeting && ! statusReset) \
&& echo "Neither Spotify nor Apple Music plays a song." \
&& echo "No Zoom call is running." \
&& echo "Status was cleared already before." \
&& echo "No action taken." && exit 0
! isStatusClean \
&& echo "Status was set by user." \
&& echo "No change will take effect." && exit 0
echo "Check if in a zoom-call ..."
inAMeeting && setStatusInMeeting && exit 0
echo "Not in a zoom-call"
echo "Check if Spotify is playing ..."
isSpotifyPlaying && setStatusSpotify && exit 0
echo "No Spotify running"
echo "Check if Apple Music is playing ..."
isAppleMusicPlaying && setStatusAppleMusic && exit 0
echo "No Apple Music is running"
reset
echo "Done"
exit 0
