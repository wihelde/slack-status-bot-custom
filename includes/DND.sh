# change your OS-DND-mode with the help of BetterTouchTool
function change_os_DND() {
  osascript -e 'tell application "BetterTouchTool"' -e 'execute_assigned_actions_for_trigger "627C9D8D-A891-4A39-8012-401F89588AE5"' -e 'end tell' >/dev/null
}

# check if DND-mode is already changed
DNDstatusReset() {
  test ! -f ./logs/$DND_STATUS_FILE && return 0
  DND_STATUS=$(cat ./logs/$DND_STATUS_FILE)
  [[ "$DND_STATUS" != "reset" ]] && return 0
  return 1
}

function activate_DND_call() {
  LEGACY_TOKEN_ARRAY_FINAL=("$@")
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -X POST -H "Authorization: Bearer $i" -s 'https://slack.com/api/dnd.setSnooze?&num_minutes=1440'
  done
}

function Deactivate_DND_call() {
  LEGACY_TOKEN_ARRAY_FINAL=("$@")
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -X POST -H "Authorization: Bearer $i" -s 'https://slack.com/api/dnd.endDnd'
  done
}

# Deactivating your DND-mode
function DeactivateDND() {
  DND_STATUS=$(cat ./logs/$DND_STATUS_FILE)
  [[ $DND_STATUS == "changed" ]] &&
    echo "Deactivating your DND-mode" &&
    change_os_DND &&
    Deactivate_DND_call &&
    echo "reset" >./logs/$DND_STATUS_FILE ||
    echo "DND-mode already deactivated"
}

#Activating your DND-mode
function activateDND() {
  DND_STATUS=$(cat ./logs/$DND_STATUS_FILE)
  [[ "$DND_STATUS" == "reset" ]] &&
    echo "Activating your DND-mode" &&
    activate_DND_call &&
    change_os_DND &&
    echo "changed" >./logs/$DND_STATUS_FILE ||
    echo "DND-mode already activated"
}