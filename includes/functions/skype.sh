source ./includes/functions/shortcuts_app.sh
source ./includes/functions/DND.sh
source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh

# check if you are  in a meeting
function inASkypeMeeting() {
  lsof -i -P -n 2>&1 | grep Skype | grep UDP | grep -E "([0-9]{1,3}[\.]){3}[0-9]{1,3}:" >/dev/null
}

# change your status when in zoom-call and activate DND-mode
function setStatusInSkypeMeeting() {
  ( inASkypeMeeting && [[ $FINAL_STATUS == "inASkypeCall" ]] ) &&
    LightOn &&
    AirPurifierOFF &&
    activateDND
  ( inASkypeMeeting && [[ $FINAL_STATUS != "inASkypeCall" ]] && isStatusClean ) &&
    export FINAL_STATUS="inASkypeCall" &&
    LightOn &&
    AirPurifierOFF &&
    activateDND &&
    echo "Trying to set your Slack-status to show you started a Zoom-Call" &&
    PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting - will answer later\", \"status_emoji\": \"$SKYPE_EMOJI\", \"status_expiration\": 0 } }" &&
    echo "Setting your Slack-status to show you started a Skype-Call" &&
    setProfile "$PAYLOAD"
  ( ! inASkypeMeeting && [[ $FINAL_STATUS == "inASkypeCall" ]] ) &&
    reset
}