#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# set PATH for jq as variable to be used in launchd
jq=/usr/local/bin/jq

# define token and emojis to use
[[ ! -f .token ]] && echo "There was no token-file found. Please create a file called .token, include your slack-tokens and define in line 11 in which line your token is present in your token-file!" && exit 1
LEGACY_TOKEN=$(awk 'NR==2' .token)
SPOTIFY_EMOJI=":spotify_2:"
ZOOM_EMOJI=":zoom_3:"
APPLE_EMOJI=":apple_music:"
DEFAULT=:heads-down:
FOCUS=:get-shit-done:
MEETING=:spiral_calendar_pad:
MONDAY=:monday:
TGIF=:tgif:
NO_COFFEE=:no-coffee:

trap onexit INT

# change your slack-status
function setProfile() {
  PAYLOAD=$1
  echo "Calling https://api.slack.com/methods/users.profile.set with $PAYLOAD"
  curl -X POST -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set" >/dev/null
  echo "changed" > .status-esome
}

# check if status is clean to be changed
function isStatusClean() {
  echo "Calling https://slack.com/api/users.profile.get ..."
  JSON=$(curl -X GET -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
  STATUS_EMOJI=$(echo "$JSON" | $jq '.profile.status_emoji' | sed 's/\"//g')
  STATUS_TEXT=$(echo "$JSON" | $jq '.profile.status_text' | sed 's/\"//g')
  echo " -> Status Emoji: \"$STATUS_EMOJI\""
  echo " -> Status Text: \"$STATUS_TEXT\""
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

# reset your status to "nothing"
function reset() {
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] && return 0
  echo 'Resetting status'
  DOW=$(date +%u)
  if [[ $DOW == "1" ]]; then
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Pretty sure I smell a Monday here ...\", \"status_emoji\" : \"$MONDAY\", \"status_expiration\": 0 } }"
  elif [[ $DOW == "5" ]]; then
    PAYLOAD="{ \"profile\": { \"status_text\" : \"TGIF!\", \"status_emoji\" : \"$TGIF\", \"status_expiration\": 0 } }"
  else
  PAYLOAD="{ \"profile\": { \"status_text\" : \"working hard on something\", \"status_emoji\" : \"$DEFAULT\", \"status_expiration\": 0 } }"
  fi
  setProfile "$PAYLOAD"
  echo "reset" > .status-esome
}

function onexit() {
  echo 'Exiting'
  isStatusClean && reset
  exit
}

# get artist and song-title from spotify via spotify-cli
function SpotifyGetSong() {
  SPOTIFY_SONG=$(osascript -e 'tell application "Spotify"' -e 'set track_artist to artist of current track' -e 'set track_name to name of current track' -e 'set podcast to album of current track' -e 'if track_artist = "" then' -e 'podcast & " - " & track_name' -e 'else' -e 'track_artist & " - " & track_name' -e 'end if' -e 'end tell')
  echo "$SPOTIFY_SONG"
}

function AppleGetSong() {
  APPLE_SONG=$(osascript -e 'tell application "Music" to artist of current track & " - " & name of current track')
  echo "$APPLE_SONG"
}

# change your status with spotify-infos
function setStatusSpotify() {
  SPOTIFY_SONG=$(SpotifyGetSong)
  echo "Trying to set Slack-Status to your current Spotify-Song"
  echo "Detected Spotify track: $SPOTIFY_SONG"
  [[ "$SPOTIFY_SONG" == "$STATUS_TEXT" ]] && echo "Same Spotify song detected. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"$SPOTIFY_SONG\", \"status_emoji\": \"$SPOTIFY_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to your current Spotify-Song"
  setProfile "$PAYLOAD"
  echo "changed" > .status-esome
}

function setStatusAppleMusic() {
  APPLE_MUSIC_SONG=$(AppleGetSong)
  echo "Trying to set Slack-Status to your current Apple Music-Song"
  echo "Detected Apple Music track: $APPLE_MUSIC_SONG"
  [[ "$APPLE_MUSIC_SONG" == "$STATUS_TEXT" ]] && echo "Same Apple Music song detected. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"$APPLE_MUSIC_SONG\", \"status_emoji\": \"$APPLE_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to your current Apple Music-Song"
  setProfile "$PAYLOAD"
  echo "changed" > .status-esome
}

# change your status when in zoom-call
function setStatusInMeeting() {
  echo "Trying to set your Slack-status to show you started a Zoom-Call"
  [[ "$ZOOM_EMOJI" == "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \"$ZOOM_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to show you started a Zoom-Call"
  setProfile "$PAYLOAD"
  echo "changed" > .status-esome
}

# check if you are still in a meeting
function inAMeeting() {
  lsof -i -P -n 2>&1 | grep zoom | grep UDP > /dev/null
}

# check if spotify is running
function isSpotifyPlaying() {
  if [ "$(pgrep -x 'Spotify')" ]
  then
    SPOTIFY_STATE=$(osascript -e 'if application "Spotify" is running then' -e 'tell application "Spotify" to player state' -e 'end if')
  fi
  [[ "$SPOTIFY_STATE" = "playing" ]] && return 0
  return 1
}

function isAppleMusicPlaying() {
  APPLE_MUSIC_STATE=$(osascript -e 'if application "Music" is running then' -e 'tell application "Music" to player state' -e 'end if')
  [[ "$APPLE_MUSIC_STATE" = "playing" ]] && return 0
  return 1
}

# check if status was already reset
statusReset() {
  test ! -f .status-esome && return 0
  STATUS=$(cat .status-esome)
  [[ "$STATUS" != "reset" ]] && return 0
  return 1
}

# do magic
( ! isSpotifyPlaying && ! isAppleMusicPlaying && ! inAMeeting && ! statusReset ) \
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
