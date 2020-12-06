#!/bin/bash

jq=/usr/local/Cellar/jq/1.6/bin/jq
spotify=/usr/local/Cellar/shpotify/2.1/bin/spotify

cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# Spotify legacy token
#[[ ! -f .token ]] && echo "There was not token found. Please execute configure.sh first!" && exit 1
LEGACY_TOKEN="REDACTED_SLACK_USER_TOKEN"
SPOTIFY_EMOJI=":spotify_2:"
ZOOM_EMOJI=":zoom_3:"

trap onexit INT

# Helper for https://api.slack.com/methods/users.profile.set Slack API Method

function setProfile() {
  PAYLOAD=$1
  echo "Calling https://api.slack.com/methods/users.profile.set with $PAYLOAD"
  curl -X POST -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set" >/dev/null
  echo "changed" > .status-esome
}

function isStatusClean() {
  JSON=$(curl -X GET -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
  STATUS_EMOJI=$(echo $JSON | jq '.profile.status_emoji' | sed 's/\"//g')
  STATUS_TEXT=$(echo $JSON | jq '.profile.status_text' | sed 's/\"//g')
  [[ "$STATUS_EMOJI" == "$SPOTIFY_EMOJI" || "$STATUS_EMOJI" == "$ZOOM_EMOJI" ]] && return 0
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] && return 0
  return 1
}

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

function getSong() {
  SONG=$(spotify status | grep -E 'Artist|Track' | awk -F': ' '{print $2}' | sed 'N;s/\n/ - /g')
  echo $SONG
}

function setStatusSpotify() {
  SONG=$(getSong)
  echo "Detected Spotify track: $SONG"
  [[ "$SONG" == "$STATUS_TEXT" ]] && echo "Same song detected. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"$SONG\", \"status_emoji\": \":spotify_2:\" } }"
  setProfile "$PAYLOAD"
  echo "changed" > .status-esome
}

function setStatusInMeeting() {
  [[ "$ZOOM_EMOJI" == "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \":zoom_3:\" } }"
  setProfile "$PAYLOAD"
}

function inAMeeting() {
  lsof -i -P -n 2>&1 | grep zoom | grep UDP > /dev/null
}

function isSpotifyPlaying() {
  #pidof spotify > /dev/null
  # SPOTIFYSTATE=$(spotify status | grep -E 'Spotify is currently ' | awk -F' ' '{print $4}' | sed 's/\.//g')
  # [[ "$SPOTIFYSTATE" = "paused" ]] && return 0
  # return 1
 state=$(osascript -e 'tell application "Spotify" to player state')
  if [[ "$state" = "playing" ]]; then
    echo "Spotify is playing"
    return 0
  else
    echo "Spotify is not playing"
    return 1
  fi
}

statusReset() {
  test ! -f .status-esome && return 1
  STATUS=$(cat .status-esome)
  [[ "$STATUS" != "reset" ]] && return 0
  return 1
}

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

