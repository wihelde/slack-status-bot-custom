# change your slack-status
function setProfile() {
  PAYLOAD=$1
  echo "Calling https://api.slack.com/methods/users.profile.set with $PAYLOAD"
  curl -X POST -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set" > /dev/null
}

# check if status is clean to be changed
function isStatusClean() {
  echo "Calling https://slack.com/api/users.profile.get ..."
  JSON=$(curl -X GET -H "Authorization: Bearer $LEGACY_TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
  STATUS_EMOJI=$(echo "$JSON" | $jq '.profile.status_emoji' | sed 's/\"//g')
  STATUS_TEXT=$(echo "$JSON" | $jq '.profile.status_text' | sed 's/\"//g')
  echo "Status Emoji: \"$STATUS_EMOJI\""
  echo "Status Text: \"$STATUS_TEXT\""
  # check for automatic custom_status_message
  [[ " ${ON_EMOJI[*]} " =~ ${STATUS_EMOJI} && " ${ON_MESSAGE[*]} " =~ ${STATUS_TEXT} ]] \
  && echo " -> Status is allowed to change" \
  && return 0
  # check for status-message set by script
  [[ "$STATUS_EMOJI" == "$SPOTIFY_EMOJI" || "$STATUS_EMOJI" == "$ZOOM_EMOJI" || "$STATUS_EMOJI" == "$APPLE_MUSIC_EMOJI" || "$STATUS_EMOJI" == "$DEFAULT_EMOJI" || "$STATUS_EMOJI" == "$MEETING_EMOJI" || "$STATUS_EMOJI" == "$MONDAY_EMOJI" || "$STATUS_EMOJI" == "$TGIF_EMOJI" ]] \
  && echo " -> Status is allowed to change" \
  && return 0
  # check for status-message set by outlook
  [[ "$STATUS_EMOJI" == ":spiral_calendar_pad:" && "$STATUS_TEXT" == "In a meeting • Outlook Calendar" ]] \
  && echo " -> Status is allowed to change" \
  && return 0
  # check for empty status-message
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] \
  && echo " -> Status is allowed to change" \
  && return 0
  # prevent status-message-change
  echo " -> Status is not allowed to change"
  return 1
}

# reset your status to your random default-status; special handling for monday and friday
function reset() {
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] && return 0
  echo 'Resetting status'
  # message for monday
  [[ $DOW == "1" ]] \
  && PAYLOAD="{ \"profile\": { \"status_text\" : \"$MONDAY_MESSAGE\", \"status_emoji\" : \"$MONDAY_EMOJI\", \"status_expiration\": 0 } }"
  # message for friday
  [[ $DOW == "5" ]] \
  && PAYLOAD="{ \"profile\": { \"status_text\" : \"$TGIF_MESSAGE\", \"status_emoji\" : \"$TGIF_EMOJI\", \"status_expiration\": 0 } }"
  # message for all other days
  [[ $DOW != "5" && $DOW != "1" ]] \
  && PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }"
  setProfile "$PAYLOAD"
  osascript -e 'display notification "'"$ON_MESSAGE_FINAL"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  echo "reset" > ./logs/$STATUS_FILE
}

# check if status was already reset
statusReset() {
  test ! -f ./logs/$STATUS_FILE && return 0
  STATUS=$(cat ./logs/$STATUS_FILE)
  [[ "$STATUS" != "reset" ]] && return 0
  return 1
}
