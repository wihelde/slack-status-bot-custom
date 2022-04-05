# change your slack-status
function setProfile() {
  PAYLOAD=$1
  echo "Calling https://api.slack.com/methods/users.profile.set with $PAYLOAD"
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -X POST -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set" >/dev/null
  done
}

function changePresence() {
  STATE=$1
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -s --data token="$i" --data presence="$STATE" "https://slack.com/api/users.setPresence"
  done
}

# check if status is clean to be changed
function isStatusClean() {
  echo "Calling https://slack.com/api/users.profile.get ..."
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    JSON=$(curl -X GET -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
    STATUS_EMOJI=$(echo "$JSON" | $jq '.profile.status_emoji' | sed 's/\"//g')
    STATUS_TEXT=$(echo "$JSON" | $jq '.profile.status_text' | sed 's/\"//g')
    echo "Status Emoji: \"$STATUS_EMOJI\""
    echo "Status Text: \"$STATUS_TEXT\""
    # check for automatic custom_status_message
    [[ " ${ON_EMOJI[*]} " =~ ${STATUS_EMOJI} ]] &&
      echo " -> Status is allowed to change" &&
      return 0
    # check for status-message set by script
    [[ "$STATUS_EMOJI" == "$SPOTIFY_EMOJI" || "$STATUS_EMOJI" == "$ZOOM_EMOJI" || "$STATUS_EMOJI" == "$APPLE_MUSIC_EMOJI" || "$STATUS_EMOJI" == "$DEFAULT_EMOJI" || "$STATUS_EMOJI" == "$MEETING_EMOJI" || "$STATUS_EMOJI" == "$MONDAY_EMOJI" || "$STATUS_EMOJI" == "$TGIF_EMOJI" || "$STATUS_EMOJI" == "$DISCORD_EMOJI" || "$STATUS_EMOJI" == "$TEAMS_EMOJI"  || "$STATUS_EMOJI" == "$SKYPE_EMOJI" || "$STATUS_EMOJI" == "$THURSDAY_EMOJI" ]] &&
      echo " -> Status is allowed to change" &&
      return 0
    # check for status-message set by outlook
    [[ "$STATUS_EMOJI" == ":spiral_calendar_pad:" && "$STATUS_TEXT" == "In a meeting • Outlook Calendar" ]] &&
      echo " -> Status is allowed to change" &&
      return 0
    # check for empty status-message
    [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] &&
      echo " -> Status is allowed to change" &&
      return 0
    # prevent status-message-change
    echo " -> Status is not allowed to change"
    return 1
  done
}

# reset your status to your random default-status; special handling for monday and friday
function reset() {
  [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] && return 0
  echo 'Resetting status'
  # message for monday
  [[ $DOW == "1" ]] &&
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$MONDAY_MESSAGE\", \"status_emoji\" : \"$MONDAY_EMOJI\", \"status_expiration\": 0 } }" &&
    osascript -e 'display notification "'"$MONDAY_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
    echo "monday" > ./logs/$STATUS_CHECK_FILE
  # message for friday
  [[ $DOW == "5" ]] &&
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$TGIF_MESSAGE\", \"status_emoji\" : \"$TGIF_EMOJI\", \"status_expiration\": 0 } }" &&
    osascript -e 'display notification "'"$TGIF_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
    echo "friday" > ./logs/$STATUS_CHECK_FILE
  # message for all other days
  [[ $DOW != "5" && $DOW != "1" ]] &&
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }" &&
    osascript -e 'display notification "'"$ON_MESSAGE_FINAL"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
    echo "weekday" > ./logs/$STATUS_CHECK_FILE
  setProfile "$PAYLOAD"
  echo "reset" >./logs/$STATUS_FILE
}

# check if your status is still correct
function is_status_correct() {
    # message for monday
    STATUS_CHECK=$(cat ./logs/$STATUS_CHECK_FILE)
    [[ $DOW == "1" && ( $STATUS_CHECK != "monday" && $STATUS_CHECK != "not working" ) ]] &&
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$MONDAY_MESSAGE\", \"status_emoji\" : \"$MONDAY_EMOJI\", \"status_expiration\": 0 } }" &&
      osascript -e 'display notification "'"$MONDAY_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
      setProfile "$PAYLOAD" &&
      STATE="auto" &&
      changePresence "$STATE" &&
      echo "monday" > ./logs/$STATUS_CHECK_FILE &&
      echo "reset" >./logs/$STATUS_FILE
    # message for all other workdays
    [[ ( $DOW = "2" || $DOW = "3" || $DOW = "4" ) && ( $STATUS_CHECK != "weekday" && $STATUS_CHECK != "not working" ) ]] &&
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }" &&
      osascript -e 'display notification "'"$ON_MESSAGE_FINAL"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
      echo "weekday" > ./logs/$STATUS_CHECK_FILE &&
      setProfile "$PAYLOAD" &&
      STATE="auto" &&
      changePresence "$STATE" &&
      echo "reset" >./logs/$STATUS_FILE
    # message for friday
    [[ $DOW == "5" && ( $STATUS_CHECK != "friday" && $STATUS_CHECK != "not working" ) ]] &&
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$TGIF_MESSAGE\", \"status_emoji\" : \"$TGIF_EMOJI\", \"status_expiration\": 0 } }" &&
      osascript -e 'display notification "'"$TGIF_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
      setProfile "$PAYLOAD" &&
      STATE="auto" &&
      changePresence "$STATE" &&
      echo "friday" > ./logs/$STATUS_CHECK_FILE &&
      echo "reset" >./logs/$STATUS_FILE
    # message for weekend
    [[ ( $DOW = "6" || $DOW = "7" ) && $STATUS_CHECK != "not working" ]] &&
      echo "not working" > ./logs/$STATUS_CHECK_FILE
}

# check if status was already reset
statusReset() {
  test ! -f ./logs/$STATUS_FILE && return 0
  STATUS=$(cat ./logs/$STATUS_FILE)
  [[ "$STATUS" != "reset" ]] && return 0
  return 1
}