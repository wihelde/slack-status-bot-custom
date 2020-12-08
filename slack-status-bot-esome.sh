#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# check if jq is installed and set PATH as variable to be used in launchd
if ! command -v jq &> /dev/null
then
    echo "jq could not be found. Please install it via 'brew install jq'! " && exit 1
else
	jq=/usr/local/bin/jq
fi

# define token and emojis to use
[[ ! -f .token ]] && echo "There was no token-file found. Please create a file called .token, include your slack-tokens and define in line 11 in which line your token is present in your token-file!" && exit 1
LEGACY_TOKEN=$(awk 'NR==2' .token)
SPOTIFY_EMOJI=":spotify_2:"
ZOOM_EMOJI=":zoom_3:"
APPLE_EMOJI=":apple_music:"

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
  JSON=$(curl -X GET -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
  STATUS_EMOJI=$(echo $JSON | $jq '.profile.status_emoji' | sed 's/\"//g')
  STATUS_TEXT=$(echo $JSON | $jq '.profile.status_text' | sed 's/\"//g')
  [[ "$STATUS_EMOJI" == "$SPOTIFY_EMOJI" || "$STATUS_EMOJI" == "$ZOOM_EMOJI" || "$STATUS_EMOJI" == "$APPLE_EMOJI" ]] && return 0
  [[ "$STATUS_EMOJI" == ":spiral_calendar_pad:" && "$STATUS_TEXT" == "In a meeting • Outlook Calendar" ]] && return 0
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] && return 0
  return 1
}

# reset your status to "nothing"
function reset() {
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] && return 0
  echo 'Resetting status'
  PAYLOAD="{ \"profile\": { \"status_text\" : \"\", \"status_emoji\" : \"\" } }"
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
  SPOTIFY_SONG=$(osascript -e 'tell application "Spotify" to artist of current track & " - " & name of current track')
  echo $SPOTIFY_SONG
}

function ApplegetSong() {
  APPLE_SONG=$(osascript -e 'tell application "Music" to artist of current track & " - " & name of current track')
  echo $APPLE_SONG
}

# change your status with spotify-infos
function setStatusSpotify() {
  SPOTIFY_SONG=$(SpotifyGetSong)
  echo "Detected Spotify track: $SPOTIFY_SONG"
  [[ "$SPOTIFY_SONG" == "$STATUS_TEXT" ]] && echo "Same Spotify song detected. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"$SPOTIFY_SONG\", \"status_emoji\": \":spotify_2:\" } }"
  setProfile "$PAYLOAD"
  echo "changed" > .status-esome
}

function setStatusAppleMusic() {
  APPLE_MUSIC_SONG=$(ApplegetSong)
  echo "Detected Apple Music track: $APPLE_MUSIC_SONG"
  [[ "$APPLE_MUSIC_SONG" == "$STATUS_TEXT" ]] && echo "Same Apple Music song detected. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"$APPLE_MUSIC_SONG\", \"status_emoji\": \":apple_music:\" } }"
  setProfile "$PAYLOAD"
  echo "changed" > .status-esome
}

# change your status when in zoom-call
function setStatusInMeeting() {
  [[ "$ZOOM_EMOJI" == "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \":zoom_3:\" } }"
  setProfile "$PAYLOAD"
  echo "changed" > .status-esome
}

# check if you are still in a meeting
function inAMeeting() {
  lsof -i -P -n 2>&1 | grep zoom | grep UDP > /dev/null
}

# check if spotify is running
function isSpotifyPlaying() {
  SPOTIFY_STATE=$(osascript -e 'if application "Spotify" is running then' -e 'tell application "Spotify" to player state' -e 'end if')
  # echo $APPLE_MUSIC_STATE
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
( ! isSpotifyPlaying && ! isAppleMusicPlaying && ! inAMeeting && ! statusReset ) && echo "Neither Spotify nor Apple Music plays a song. No Zoom call is running. Status was cleared already before. No action taken." && exit 0
! isStatusClean && echo "Status was set by user. No change will take effect." && exit 0
echo "Status is clean"
inAMeeting && setStatusInMeeting && exit 0
echo "Not in a meeting"
isSpotifyPlaying && setStatusSpotify && exit 0
echo "No Spotify running"
isAppleMusicPlaying && setStatusAppleMusic && exit 0
echo "No Apple Music is running"
reset
echo "Done"
exit 0
