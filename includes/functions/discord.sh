source ./includes/functions/shortcuts_app.sh
source ./includes/functions/DND.sh
source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh

# check if you are  in a meeting
function inADiscordMeeting() {
  lsof -i -P -n 2>&1 | grep Discord | grep UDP | grep -E "[\:]([0-9]{5})$" >/dev/null
}

# change your status when in zoom-call and activate DND-mode
function setStatusInDiscordMeeting() {
    ( inADiscordMeeting && [[ $FINAL_STATUS == "inADiscordMeeting" ]] ) &&
      LightOn &&
      AirPurifierOFF
    ( inADiscordMeeting && [[ $FINAL_STATUS != "inADiscordMeeting" ]] && isStatusClean ) &&
      export FINAL_STATUS="inADiscordMeeting" &&
      LightOn &&
      AirPurifierOFF &&
      echo "Trying to set your Slack-status to show you started a Discord-Call" &&
      PAYLOAD="{ \"profile\": { \"status_text\": \"In a meeting\", \"status_emoji\": \"$DISCORD_EMOJI\", \"status_expiration\": 0 } }" &&
      echo "Setting your Slack-status to show you started a Discord-Call" &&
      setProfile "$PAYLOAD"
  ( ! inADiscordMeeting && [[ $FINAL_STATUS == "inADiscordMeeting" ]] ) &&
    reset
}