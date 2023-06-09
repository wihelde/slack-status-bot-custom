source ./includes/functions/DND.sh
source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh

# check if you are  in a meeting
function inAMicrosoftTeamsMeeting() {
  lsof -i -P -n 2>&1 | grep Microsoft | grep UDP | grep -E "([0-9]{1,3}[\.]){3}[0-9]{1,3}[\:](500[0-9]{2})$" >/dev/null
}

# change your status when in zoom-call and activate DND-mode
function setStatusInMicrosoftTeamsMeeting() {
  ( inAMicrosoftTeamsMeeting && [[ $FINAL_STATUS == "inAMicrosoftTeamsCall" ]] ) &&
    activateDND
  ( inAMicrosoftTeamsMeeting && [[ $FINAL_STATUS != "inAMicrosoftTeamsCall" ]] && isStatusClean ) &&
    export FINAL_STATUS="inAMicrosoftTeamsCall" &&
    activateDND &&
    echo "Trying to set your Slack-status to show you started a Microsoft-Teams-Call" &&
    PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting - will answer later\", \"status_emoji\": \"$TEAMS_EMOJI\", \"status_expiration\": 0 } }" &&
    echo "Setting your Slack-status to show you started a Microsoft-Teams-Call" &&
    setProfile "$PAYLOAD"
  ( ! inAMicrosoftTeamsMeeting && [[ $FINAL_STATUS == "inAMicrosoftTeamsCall" ]] ) &&
    reset
}
