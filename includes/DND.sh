# change your OS-DND-mode with the help of BetterTouchTool
function change_os_DND() {
  [[ $OSX_DND_MODE == "on" ]] \
  && osascript -e 'tell application "BetterTouchTool"' -e 'execute_assigned_actions_for_trigger "627C9D8D-A891-4A39-8012-401F89588AE5"' -e 'end tell' \
  || return 0
}

# check if DND-mode is already changed
DNDstatusReset() {
  test ! -f ./logs/$DND_STATUS_FILE && return 0
  DND_STATUS=$(cat ./logs/$DND_STATUS_FILE)
  [[ "$DND_STATUS" != "reset" ]] &&  return 0
  return 1
}

# Deactivating your DND-mode
function DeactivateDND() {
  DND_STATUS=$(cat ./logs/$DND_STATUS_FILE)
  CURL_URL='https://slack.com/api/dnd.endDnd?token='$LEGACY_TOKEN
  [[ $DND_STATUS == "changed" ]] \
  && echo "Deactivating your DND-mode" \
  && change_os_DND \
  && curl -s "$CURL_URL" > /dev/null \
  && echo "reset" > ./logs/$DND_STATUS_FILE \
  || echo "DND-mode already deactivated"
}

#Activating your DND-mode
function activateDND() {
  DND_STATUS=$(cat ./logs/$DND_STATUS_FILE)
  CURL_URL='https://slack.com/api/dnd.setSnooze?token='$LEGACY_TOKEN'&num_minutes=1440'
  [[ "$DND_STATUS" == "reset" ]] \
  && echo "Activating your DND-mode" \
  && curl -s "$CURL_URL" > /dev/null \
  && change_os_DND \
  && echo "changed" > ./logs/$DND_STATUS_FILE \
  || echo "DND-mode already activated"
}
