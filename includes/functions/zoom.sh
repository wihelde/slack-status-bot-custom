source ./includes/functions/shortcuts_app.sh
source ./includes/functions/DND.sh
source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh

# check if you are in a meeting
function inAMeeting() {
  lsof -i -P -n 2>&1 | grep zoom | grep UDP >/dev/null
}

# change your status when in zoom-call and activate DND-mode
function setStatusInMeeting() {
  ( inAMeeting && [[ $FINAL_STATUS == "inAZoomCall" ]] ) &&
    LightOn &&
    AirPurifierOFF &&
    activateDND
  ( inAMeeting && [[ $FINAL_STATUS != "inAZoomCall" ]] && isStatusClean ) &&
    export FINAL_STATUS="inAZoomCall" &&
    LightOn &&
    AirPurifierOFF &&
    activateDND &&
    echo "Trying to set your Slack-status to show you started a Zoom-Call" &&
    PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting - will answer later\", \"status_emoji\": \"$ZOOM_EMOJI\", \"status_expiration\": 0 } }" &&
    echo "Setting your Slack-status to show you started a Zoom-Call" &&
    setProfile "$PAYLOAD"
  ( ! inAMeeting && [[ $FINAL_STATUS == "inAZoomCall" ]] ) &&
    reset
  return 0
}