#!/bin/bash

# You can use this little script to be run at specific times in the evening
# to "go offline" just in case you forgot it (e.g. run at 9pm, 10pm and / or 11pm)
# It will respect and not change some status, e.g. when you are on holiday or sick, but
#  you can change from these status by using the awayback.sh-script anyways

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh

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
    [[ "$STATUS_EMOJI" == "$OFF_EMOJI" || "$STATUS_EMOJI" == "$SICK_EMOJI" || "$STATUS_EMOJI" == "$HOLIDAY_EMOJI" || "$STATUS_EMOJI" == "$ZOOM_EMOJI" ]] &&
      echo " -> Status is not allowed to change" &&
      return 1
    # check for status-message set by outlook
    [[ "$STATUS_EMOJI" == ":spiral_calendar_pad:" && "$STATUS_TEXT" == "In a meeting • Outlook Calendar" ]] &&
      echo " -> Status is allowed to change" &&
      return 0
    # check for empty status-message
    [[ "$STATUS_EMOJI" == "" && "$STATUS_TEXT" == "" ]] &&
      echo " -> Status is allowed to change" &&
      return 0
    # prevent status-message-change
    echo " -> Status is allowed to change"
    return 0
  done
}

function changeStatus() {
  STATE=away
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -s --data token="$i" \
      --data presence="$STATE" \
      https://slack.com/api/users.setPresence |
      grep -Eq '"ok": ?true' &&
      echo "Away status updated ok" ||
      echo "There was a problem updating the away status"
  done
}

function setProfile() {
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$OFFLINE_MESSAGE\", \"status_emoji\" : \"$OFF_EMOJI\", \"status_expiration\": 0 } }"
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -X POST -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set"
  done
  osascript -e 'display notification "'"$OFFLINE_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  echo "not working" > ./logs/$STATUS_CHECK_FILE
}

isStatusClean && changeStatus && setProfile && exit 0