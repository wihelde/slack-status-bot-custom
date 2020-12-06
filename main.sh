#!/bin/bash

# Spotify legacy token

# LEGACY_TOKEN="REDACTED_SLACK_USER_TOKEN" #esome
LEGACY_TOKEN="REDACTED_SLACK_USER_TOKEN" #bloggerbutze
trap onexit INT

# Helper for https://api.slack.com/methods/users.profile.set Slack API Method

function setProfile() {
  PAYLOAD=$1
  echo "Calling https://api.slack.com/methods/users.profile.set with $PAYLOAD"
  curl -X POST -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set" >/dev/null
}

function reset() {
  JSON=$(curl -X GET -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
  STATUS_EMOJI=$(echo $JSON | jq '.profile.status_emoji' | sed 's/\"//g')
  echo $STATUS_EMOJI
  if [[ $STATUS_EMOJI != :spotify_2: && $STATUS_EMOJI != :zoom_3: ]]; then
    exit
  else
    echo 'Resetting status'
    PAYLOAD="{ \"profile\": { \"status_text\" : \"\", \"status_emoji\" : \"\" } }"n
    setProfile "$PAYLOAD"
  fi
}

function onexit() {
  echo 'Exiting'
  reset
  exit
}

function getSong() {
  SONG=$(osascript -e 'tell application "Spotify" to artist of current track & " - " & name of current track')
  echo $SONG
}

#pgrep Spotify > /dev/null
#if [ $? -ne 0 ]; then
#  echo 'Spotify is not running, exiting'
#  reset
#  exit 0
#fi

state=$(osascript -e 'tell application "Spotify" to player state')
echo "$(date) Spotify state: $state"

if [[ "$state" != "playing" ]]; then
  echo 'Spotify is not playing any song, exiting'
  reset
else
  JSON=$(curl -X GET -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
  STATUS_EMOJI=$(echo $JSON | jq '.profile.status_emoji' | sed 's/\"//g')
  SONG=$(getSong)
  echo "Detected Spotify track: $SONG"

  if [[ $STATUS_EMOJI == ":heads-down:" || $STATUS_EMOJI == "" || $STATUS_EMOJI == ":spotify_2:" ]]; then
    PAYLOAD="{ \"profile\": { \"status_text\": \"$SONG\", \"status_emoji\": \":spotify_2:\" } }"
    setProfile "$PAYLOAD"
  else
    exit
  fi
fi

echo "Done"
exit 0
