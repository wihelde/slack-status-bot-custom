#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# needed for stupid launchd-execution
jq=/usr/local/bin/jq
spotify=/usr/local/bin/spotify

# define token and emojis to use
[[ ! -f .token ]] && echo "There was no token-file found. Please create a file called .token, include your slack-tokens and define in line 11 in which line your token is present!" && exit 1
LEGACY_TOKEN=$(awk 'NR==2' .token)
SPOTIFY_EMOJI=":spotify_2:"
ZOOM_EMOJI=":zoom_3:"

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
  [[ "$STATUS_EMOJI" == "$SPOTIFY_EMOJI" || "$STATUS_EMOJI" == "$ZOOM_EMOJI" ]] && return 0
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
function getSong() {
  SONG=$($spotify status | grep -E 'Artist|Track' | awk -F': ' '{print $2}' | sed 'N;s/\n/ - /g')
  echo $SONG
}

# change your status with spotify-infos
function setStatusSpotify() {
  SONG=$(getSong)
  echo "Detected Spotify track: $SONG"
  [[ "$SONG" == "$STATUS_TEXT" ]] && echo "Same song detected. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"$SONG\", \"status_emoji\": \":spotify_2:\" } }"
  setProfile "$PAYLOAD"
  echo "changed" > .status-esome
}

# change your status when in zoom-call
function setStatusInMeeting() {
  [[ "$ZOOM_EMOJI" == "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \":zoom_3:\" } }"
  setProfile "$PAYLOAD"
}

# check if you are still in a meeting
function inAMeeting() {
  lsof -i -P -n 2>&1 | grep zoom | grep UDP > /dev/null
}

# check if spotify is running
function isSpotifyPlaying() {
  #pidof spotify > /dev/null
  SPOTIFYSTATE=$(spotify status | grep -E 'Spotify is currently ' | awk -F' ' '{print $4}' | sed 's/\..*//g')
  [[ "$SPOTIFYSTATE" = "playing" ]] && return 0
  return 1
}

# check if status was already reset
statusReset() {
  test ! -f .status-esome && return 1
  STATUS=$(cat .status-esome)
  [[ "$STATUS" != "reset" ]] && return 0
  return 1
}

# do magic
( ! isSpotifyPlaying && ! inAMeeting && ! statusReset ) && echo "Neither Spotify plays a song nor zoom call is running. Status was cleared already before. No action taken." && exit 0
! isStatusClean && echo "Status was set by user. No change will take effect." && exit 0
echo "Status is clean"
inAMeeting && setStatusInMeeting && exit 0
echo "Not in a meeting"
isSpotifyPlaying > /dev/null && setStatusSpotify && exit 0
echo "No spotify running"
reset
echo "Done"
exit 0

