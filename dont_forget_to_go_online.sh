#!/bin/bash

# You can use this little script to be run at specific times in the evening
# to "go offline" just in case you forgot it (e.g. run at 9pm, 10pm and / or 11pm)
# It will respect and not change some status, e.g. when you are on holiday or sick, but
#  you can change from these status by using the awayback.sh-script anyways

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

source ./includes/misc.sh
source ./includes/custom_status_messages.sh
source ./includes/DND.sh

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
    [[ " ${OFF_EMOJI[*]} " =~ ${STATUS_EMOJI} ]] &&
      echo " -> Status is allowed to change" &&
      return 0
    # check for status-message set by script
    [[ ! " ${OFF_EMOJI[*]} " =~ ${STATUS_EMOJI} ]] &&
      echo " -> Status is not allowed to change" &&
      return 1
    # prevent status-message-change
    echo " -> Status is allowed to change"
    return 0
  done
}

function changeStatus() {
  STATE=auto
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
  DeactivateDND
  if [[ $DOW == "1" ]]; then
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$MONDAY_MESSAGE\", \"status_emoji\" : \"$MONDAY_EMOJI\", \"status_expiration\": 0 } }"
      for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
        curl -X POST -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set"
      done
    osascript -e 'display notification "'"$MONDAY_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    echo "monday" > ./logs/$STATUS_CHECK_FILE
  elif [[ $DOW == "5" ]]; then
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$TGIF_MESSAGE\", \"status_emoji\" : \"$TGIF_EMOJI\", \"status_expiration\": 0 } }"
      for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
        curl -X POST -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set"
      done
    osascript -e 'display notification "'"$TGIF_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    echo "friday" > ./logs/$STATUS_CHECK_FILE
  else
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }"
      for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
        curl -X POST -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set"
      done
    osascript -e 'display notification "'"$ON_MESSAGE_FINAL"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    echo "weekday" > ./logs/$STATUS_CHECK_FILE
  fi
}

isStatusClean && changeStatus && setProfile && exit 0