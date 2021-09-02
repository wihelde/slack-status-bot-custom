# check if you are  in a meeting
function inAMicrosoftTeamsMeeting() {
  lsof -i -P -n 2>&1 | grep Microsoft | grep UDP | grep -E "([0-9]{1,3}[\.]){3}[0-9]{1,3}":500 >/dev/null
}

# change your status when in zoom-call and activate DND-mode
function setStatusInMicrosoftTeamsMeeting() {
  [[ "$TEAMS_EMOJI" == "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  echo "Trying to set your Slack-status to show you started a Microsoft-Teams-Call"
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \"$TEAMS_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to show you started a Microsoft-Teams-Call"
  setProfile "$PAYLOAD"
  ! DNDstatusReset && activateDND
  echo "changed" >./logs/$STATUS_FILE
}