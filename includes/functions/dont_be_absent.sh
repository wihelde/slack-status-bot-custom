source ./includes/helper/misc.sh
source ./includes/functions/slack.sh

# check if presence is correct
function isPresenceActive() {
  echo "$DATE: Calling https://slack.com/api/users.getPresence ..."
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    JSON=$(curl -X GET -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.getPresence")
    presence=$(echo "$JSON" | $jq '.presence' | sed 's/\"//g')
    echo "$DATE: presence: \"$presence\""
    # check for automatic custom_status_message
    [[ "$presence" == "away" ]] &&
      echo "$DATE:  -> Presence needs to be changed" &&
      return 0
    # prevent status-message-change
    echo "$DATE:  -> Presence is already active"
    return 1
  done
}


# check if your status is still correct
function isPresenceCorrect() {
    # message for monday
    STATUS_CHECK=$(cat ./logs/$STATUS_CHECK_FILE)
    if [[ $STATUS_CHECK != "not working" ]] ;then
        for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
          curl -s --data token="$i" \
            --data presence="auto" \
            https://slack.com/api/users.setPresence |
            grep -Eq '"ok": ?true' &&
            echo "$DATE: Away status updated ok" ||
            echo "$DATE: There was a problem updating the away status"
        done
    else
      echo "$DATE: presence update not allowed"
    fi

}

function correctPresenceStatus() {
  isStatusClean && isPresenceCorrect
}
