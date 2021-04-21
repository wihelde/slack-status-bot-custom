# check if you are  in a meeting
function inAMeeting() {
  lsof -i -P -n 2>&1 | grep zoom | grep UDP > /dev/null
}

# change your status when in zoom-call and activate DND-mode
function setStatusInMeeting() {
  [[ "$ZOOM_EMOJI" == "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  echo "Trying to set your Slack-status to show you started a Zoom-Call"
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \"$ZOOM_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to show you started a Zoom-Call"
  setProfile "$PAYLOAD"
  ! DNDstatusReset && activateDND
  echo "changed" > ./logs/$STATUS_FILE
}
