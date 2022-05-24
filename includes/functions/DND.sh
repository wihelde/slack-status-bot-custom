# Enable Mac OS focus mode via shortcuts-app
function FocusON() {
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" ]] && shortcuts run "$FOCUS_ON"
  return 0
}

# Disable Mac OS focus mode via shortcuts-app
function FocusOFF() {
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" ]] && shortcuts run "$FOCUS_OFF"
  return 0
}

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

# Deactivate your DND-mode
function DeactivateDND() {
  export DND_STATUS=$(osascript -l JavaScript includes/helper/focus.jxa)
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" ]] &&
    [[ "$DND_STATUS" == "No Focus" ]] &&
    echo "DND-mode already deactivated"
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" ]] &&
    [[ "$DND_STATUS" == "Do Not Disturb" ]] &&
    export FINAL_DND_STATUS="DNDInactive" &&
    echo "Deactivating your DND-mode" &&
    Deactivate_DND_call &&
    FocusOFF
  return 0
}

#Activate your DND-mode
function activateDND() {
  export DND_STATUS=$(osascript -l JavaScript includes/helper/focus.jxa)
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" ]] &&
    [[ "$DND_STATUS" == "Do Not Disturb" ]] &&
    echo "DND-mode already activated"
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" ]] &&
    [[ "$DND_STATUS" == "No focus" ]] &&
    export FINAL_DND_STATUS="DNDActive" &&
    echo "Activating your DND-mode" &&
    activate_DND_call &&
    FocusON
  return 0
}