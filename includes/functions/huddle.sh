source ./includes/functions/DND.sh
source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh

# check if you are in a meeting
function inAhuddle() {
#    echo "$DATE: Calling https://slack.com/api/users.profile.get ..."
#    STATUS_CHECK=$(cat ./logs/$STATUS_CHECK_FILE)
#    for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
#      JSON=$(curl -X GET -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
#      HUDDLE_STATE=$(echo "$JSON" | $jq '.profile.huddle_state' | sed 's/\"//g')
#      echo "$DATE: Huddle State: \"$HUDDLE_STATE\""
#      [[ "$HUDDLE_STATE" == "in_a_huddle" ]] &&
#      [[ $STATUS_CHECK != "not working" ]] &&
#        echo "$DATE:  -> in a huddle" &&
#        return 0
#      return 1
#    done
    lsof -i -P -n 2>&1 | grep Slack | grep UDP | grep -E "([0-9]{5})$" >/dev/null
  }

# change your status when in zoom-call and activate DND-mode
function setStatusInAHuddle() {
  ( inAhuddle && [[ $FINAL_STATUS == "inAhuddle" ]] ) &&
    activateDND
  ( inAhuddle && [[ $FINAL_STATUS != "inAhuddle" ]] && isStatusClean ) &&
    export FINAL_STATUS="inAhuddle" &&
    activateDND &&
    echo "Trying to set your Slack-status to show you started a Zoom-Call" &&
    PAYLOAD="{ \"profile\": { \"status_text\": \"In a huddle - will answer later\", \"status_emoji\": \"$HUDDLE_EMOJI\", \"status_expiration\": 0 } }" &&
    echo "Setting your Slack-status to show you started a Zoom-Call" &&
    setProfile "$PAYLOAD"
  ( ! inAhuddle && [[ $FINAL_STATUS == "inAhuddle" ]] ) &&
    reset
  return 0
}
