#!/bin/bash

# Spotify legacy token

LEGACY_TOKEN="REDACTED_SLACK_USER_TOKEN"
trap onexit INT

SPOTIFY_EMOJI=":spotify_2:"
ZOOM_EMOJI=":zoom_3:"
GENERAL_EMOJI=":heads-down:"


# Helper for https://api.slack.com/methods/users.profile.set Slack API Method

function setProfile() {
  PAYLOAD=$1
  echo "Calling https://api.slack.com/methods/users.profile.set with $PAYLOAD"
  curl -X POST -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set" > /dev/null
  echo "changed" > .status
}

function isStatusClean() {
  JSON=$(curl -X GET -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
  STATUS_EMOJI=$(echo $JSON | jq '.profile.status_emoji' | sed 's/\"//g')
  STATUS_TEXT=$(echo $JSON | jq '.profile.status_text' | sed 's/\"//g')
  [[ "$STATUS_EMOJI" = "$SPOTIFY_EMOJI" || "$STATUS_EMOJI" = "$ZOOM_EMOJI" ]] && return 0
  [[ "$STATUS_EMOJI" = "$GENERAL_EMOJI" ]] && return 0
  [[ "$STATUS_EMOJI" = "" ]] && return 0
  return 1
}

function reset() {
  echo "reset" > .status
  [[ "$STATUS_EMOJI" = "$GENERAL_EMOJI" ]] && return 0
  echo 'Resetting status'
  PAYLOAD="{ \"profile\": { \"status_text\" : \"\", \"status_emoji\" : \":heads-down:\" } }"
  setProfile "$PAYLOAD"
}

function onexit() {
  echo 'Exiting'
  isStatusClean && reset
  exit
}

function getSong() {
  SONG=$(osascript -e 'tell application "Spotify" to artist of current track & " - " & name of current track')
  echo $SONG
}

function setStatusSpotify() {
  SONG=$(getSong)
  echo "Detected Spotify track: $SONG"
  PAYLOAD="{ \"profile\": { \"status_text\": \"$SONG\", \"status_emoji\": \":spotify_2:\" } }"
  setProfile "$PAYLOAD"
}

function setStatusInMeeting() {
  [[ "$ZOOM_EMOJI" = "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \":zoom_3:\" } }"
  setProfile "$PAYLOAD"
}

function inAMeeting() {
  lsof -i -n -P 2>&1 | grep zoom | grep UDP > /dev/null
}

function checkSpotifyState() {
  state=$(osascript -e 'tell application "Spotify" to player state')
  #echo "$(date) Spotify state: $state"

  if [[ "$state" != "playing" ]]; then
    echo 'Spotify is not playing any song'
    isStatusClean && reset
  else
    SONG=$(getSong)
    echo "Detected Spotify track: $SONG"

    PAYLOAD="{ \"profile\": { \"status_text\": \"$SONG\", \"status_emoji\": \":spotify_2:\" } }"
    setProfile "$PAYLOAD"
  fi
}

function spotifyRunning() {
  ps -aumartin_temp | grep -v grep | grep -ci spotify > /dev/null
}

statusReset() {
  [[ ! -f .status ]] && return 1
  STATUS=$(cat .status)
  [[ "$STATUS" != "reset" ]] && return 1
  return 0
}

( ! spotifyRunning && ! inAMeeting && statusReset ) && echo "Neither Spotify nor zoom call is running. Status was cleared already before. No action taken." && exit 0
! isStatusClean && echo "Status was set by user. No change will take effect." && exit 0
echo "Status is clean"
inAMeeting && setStatusInMeeting && exit 0
echo "Not in a meeting"
checkSpotifyState
echo "Done"
exit 0
