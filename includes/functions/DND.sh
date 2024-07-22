# Disable slack-notifications
function activate_DND_call() {
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -X POST -H "Authorization: Bearer $i" -s 'https://slack.com/api/dnd.setSnooze?&num_minutes=1440'
  done
}

# Enable slack-notifications
function Deactivate_DND_call() {
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -X POST -H "Authorization: Bearer $i" -s 'https://slack.com/api/dnd.endDnd'
  done
}

function GatherOffline() {
  osascript -e 'try' -e 'if application "Gather" is running then' -e 'tell application "Gather" to activate' -e 'delay 0.1' -e 'tell application "System Events"' -e 'keystroke "u" using command down' -e 'end tell' -e 'end if' -e 'end try'
}

function GatherOnline() {
  #osascript -e 'tell application "Gather" to activate' -e 'delay 0.1' -e 'tell application "System Events"' -e 'key code 53' -e 'end tell'
  osascript -e 'try' -e 'if application "Gather" is running then' -e 'tell application "Gather" to activate' -e 'delay 0.1' -e 'tell application "System Events"' -e 'keystroke "i" using command down' -e 'end tell' -e 'end if' -e 'end try'
}

# Deactivate your DND-mode
function DeactivateDND() {
    [[ "$ENABLE_FOCUS_SWITCH" == "yes" && $FINAL_DND_STATUS == "DNDInactive" ]] &&
    echo "DND-mode already deactivated"
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" && $FINAL_DND_STATUS != "DNDInactive" ]] &&
    export FINAL_DND_STATUS="DNDInactive" &&
    echo "Deactivating your DND-mode" &&
    Deactivate_DND_call &&
    GatherOnline
  return 0
}

#Activate your DND-mode
function activateDND() {
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" && $FINAL_DND_STATUS == "DNDActive" ]] &&
    echo "DND-mode already activated"
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" && $FINAL_DND_STATUS != "DNDActive" ]] &&
    export FINAL_DND_STATUS="DNDActive" &&
    echo "Activating your DND-mode" &&
    activate_DND_call &&
    GatherOffline
  return 0
}
