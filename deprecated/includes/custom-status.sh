function setProfile() {
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -X POST -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set"
  done
}

function changeStatus() {
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
    curl -s --data token="$i" \
      --data presence="$STATE" \
      https://slack.com/api/users.setPresence |
      grep -Eq '"ok": ?true' &&
      echo "Away status updated ok" ||
      echo "There was a problem updating the away status"
  done
}

#function GatherOffline() {
#  #osascript -e 'try' -e 'if application "Discord" is running then' -e 'tell application "Discord" to activate' -e 'delay 0.1' -e 'tell application "System Events"' -e 'keystroke "d" using {command down, shift down}' -e 'end tell' -e 'end if' -e 'end try'
#  /usr/bin/osascript <<'APPLESCRIPT'
#tell application "System Events"
#  keystroke "d" using {command down, shift down}
#end tell
#APPLESCRIPT
#}

#function GatherOnline() {
#  #osascript -e 'try' -e 'if application "Discord" is running then' -e 'tell application "Discord" to activate' -e 'delay 0.1' -e 'tell application "System Events"' -e 'keystroke "d" using {command down, shift down}' -e 'end tell' -e 'end if' -e 'end try'
#  /usr/bin/osascript <<'APPLESCRIPT'
#tell application "System Events"
#  keystroke "d" using {command down, shift down}
#end tell
#APPLESCRIPT
#}

STATUS="$1"
LAST_HOLIDAY="$2"

if [[ $STATUS == "on" ]]; then
  STATE=auto
  export FINAL_STATUS="reset"
  # message for monday
  GatherOnline
  Deactivate_DND_call
  if [[ $DOW == "1" ]]; then
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$MONDAY_MESSAGE\", \"status_emoji\" : \"$MONDAY_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$MONDAY_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    echo "monday" > ./logs/$STATUS_CHECK_FILE
  # message for friday
  elif [[ $DOW == "5" ]]; then
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$TGIF_MESSAGE\", \"status_emoji\" : \"$TGIF_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$TGIF_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    echo "friday" > ./logs/$STATUS_CHECK_FILE
  elif [[ $DOW == "6" || $DOW == "7" ]]; then
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$ON_MESSAGE_FINAL"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    echo "not working" > ./logs/$STATUS_CHECK_FILE
  # message for all other days
  else
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$ON_MESSAGE_FINAL"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    echo "weekday" > ./logs/$STATUS_CHECK_FILE
  fi
fi

if [[ $STATUS == "off" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$OFFLINE_MESSAGE\", \"status_emoji\" : \"$OFF_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$OFFLINE_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "child-doc" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$CHILD_DOC_MESSAGE\", \"status_emoji\" : \"$CHILD_DOC_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$CHILD_DOC_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "sick-on" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$SICK_MESSAGE\", \"status_emoji\" : \"$SICK_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$SICK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "sick-off" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$SICK_MESSAGE\", \"status_emoji\" : \"$SICK_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$SICK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  echo "not working" > ./logs/$STATUS_CHECK_FILE
  activate_DND_call
fi

if [[ $STATUS == "break-on" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$BREAK_MESSAGE\", \"status_emoji\" : \"$BREAK_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$BREAK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
fi

if [[ $STATUS == "break-off" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$BREAK_MESSAGE\", \"status_emoji\" : \"$BREAK_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$BREAK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
fi

if [[ $STATUS == "holiday-on" ]]; then
  STATE=away
  if [[ -n $LAST_HOLIDAY ]]; then
      LAST_HOLIDAY_DAY=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%A')
      ADD_DAYS=1
      [[ $LAST_HOLIDAY_DAY == "Friday" ]] && ADD_DAYS=3

      DATE_BACK=$(date -j -v +"$ADD_DAYS"d -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%d.%m.%Y')
      DATEBACK_MESSAGE=" (back on ${DATE_BACK})"

      TIMESTAMP_PARSE=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%Y:%m:%d 23:59:59')
      TIMESTAMP=$(date -j -v +"$((ADD_DAYS - 1))"d -f "%Y:%m:%d %H:%M:%S" "$TIMESTAMP_PARSE" +%s)
  else
      LAST_HOLIDAY=""
      TIMESTAMP="0"
  fi
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$VACATION_MESSAGE $DATEBACK_MESSAGE\", \"status_emoji\" : \"$HOLIDAY_EMOJI\", \"status_expiration\": $TIMESTAMP } }"
  osascript -e 'display notification "'"$VACATION_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "holiday-off" ]]; then
  STATE=away
  if [[ -n $LAST_HOLIDAY ]]; then
      LAST_HOLIDAY_DAY=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%A')
      ADD_DAYS=1
      [[ $LAST_HOLIDAY_DAY == "Friday" ]] && ADD_DAYS=3

      DATE_BACK=$(date -j -v +"$ADD_DAYS"d -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%d.%m.%Y')
      DATEBACK_MESSAGE=" (back on ${DATE_BACK})"

      TIMESTAMP_PARSE=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%Y:%m:%d 23:59:59')
      TIMESTAMP=$(date -j -v +"$((ADD_DAYS - 1))"d -f "%Y:%m:%d %H:%M:%S" "$TIMESTAMP_PARSE" +%s)
  else
      LAST_HOLIDAY=""
      TIMESTAMP="0"
  fi
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$VACATION_MESSAGE $DATEBACK_MESSAGE\", \"status_emoji\" : \"$HOLIDAY_EMOJI\", \"status_expiration\": $TIMESTAMP } }"
  echo $PAYLOAD
  osascript -e 'display notification "'"$VACATION_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "parental-leave" ]]; then
  STATE=away
  if [[ -n $LAST_HOLIDAY ]]; then
      LAST_HOLIDAY_DAY=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%A')
      ADD_DAYS=1
      [[ $LAST_HOLIDAY_DAY == "Friday" ]] && ADD_DAYS=3

      DATE_BACK=$(date -j -v +"$ADD_DAYS"d -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%d.%m.%Y')
      DATEBACK_MESSAGE=" (back on ${DATE_BACK})"

      TIMESTAMP_PARSE=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%Y:%m:%d 23:59:59')
      TIMESTAMP=$(date -j -v +"$((ADD_DAYS - 1))"d -f "%Y:%m:%d %H:%M:%S" "$TIMESTAMP_PARSE" +%s)
  else
      LAST_HOLIDAY=""
      TIMESTAMP="0"
  fi
  echo "TIMESTAMP: $TIMESTAMP"  # Debug-Ausgabe
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$PARENTAL_LEAVE_MESSAGE $DATEBACK_MESSAGE\", \"status_emoji\" : \"$PARENTAL_LEAVE_EMOJI\", \"status_expiration\": $TIMESTAMP } }"
  echo $PAYLOAD
  osascript -e 'display notification "'"$PARENTAL_LEAVE_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "meeting" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$MEETING_MESSAGE\", \"status_emoji\" : \"$MEETING_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$MEETING_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  activate_DND_call
fi

if [[ $STATUS == "dnd" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$FOCUS_MESSAGE\", \"status_emoji\" : \"$FOCUS_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$FOCUS_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  activate_DND_call
fi

if [[ $STATUS == "shopping" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$SHOPPING_MESSAGE\", \"status_emoji\" : \"$SHOPPING_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$SHOPPING_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
fi

if [[ $STATUS == "dog" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$DOG_MESSAGE\", \"status_emoji\" : \"$DOG_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$DOG_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
fi

if [[ $STATUS == "remeet" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\": \"$REMEET_MESSAGE\", \"status_emoji\": \"$REMEET_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$REMEET_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
  activate_DND_call
fi

if [[ $STATUS == "travel" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$TRAVEL_MESSAGE\", \"status_emoji\" : \"$TRAVEL_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$TRAVEL_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  GatherOffline
fi
