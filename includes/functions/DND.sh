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
    [[ "$ENABLE_FOCUS_SWITCH" == "yes" && $FINAL_DND_STATUS == "DNDInactive" ]] &&
    echo "DND-mode already deactivated"
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" && $FINAL_DND_STATUS != "DNDInactive" ]] &&
    export FINAL_DND_STATUS="DNDInactive" &&
    echo "Deactivating your DND-mode" &&
    Deactivate_DND_call
  return 0
}

#Activate your DND-mode
function activateDND() {
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" && $FINAL_DND_STATUS == "DNDActive" ]] &&
    echo "DND-mode already activated"
  [[ "$ENABLE_FOCUS_SWITCH" == "yes" && $FINAL_DND_STATUS != "DNDActive" ]] &&
    export FINAL_DND_STATUS="DNDActive" &&
    echo "Activating your DND-mode" &&
    activate_DND_call
  return 0
}