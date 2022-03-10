# check if you are  in a meeting
function inADiscordMeeting() {
  lsof -i -P -n 2>&1 | grep Discord | grep UDP | grep -E "[\:]([0-9]{5})$" >/dev/null
}

# change your status when in zoom-call and activate DND-mode
function setStatusInDiscordMeeting() {
  [[ "$DISCORD_EMOJI" == "$STATUS_EMOJI" ]] && echo "Still in a meeting. Call to API will be avoided." && return 0
  echo "Trying to set your Slack-status to show you started a Discord-Call"
  PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \"$DISCORD_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to show you started a Discord-Call"
  setProfile "$PAYLOAD"
  ! DNDstatusReset && activateDND
  echo "changed" >./logs/$STATUS_FILE
}