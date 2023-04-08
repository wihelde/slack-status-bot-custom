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

STATUS="$1"
LAST_HOLIDAY="$2"

if [[ $STATUS == "on" ]]; then
  STATE=auto
  export FINAL_STATUS="reset"
  # message for monday
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
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "sick-on" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$SICK_MESSAGE\", \"status_emoji\" : \"$SICK_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$SICK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "sick-off" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$SICK_MESSAGE sick\", \"status_emoji\" : \"$SICK_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$SICK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  echo "not working" > ./logs/$STATUS_CHECK_FILE
  activate_DND_call
fi

if [[ $STATUS == "break-on" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$BREAK_MESSAGE\", \"status_emoji\" : \"$BREAK_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$BREAK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "break-off" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$BREAK_MESSAGE\", \"status_emoji\" : \"$BREAK_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$BREAK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "holiday-on" ]]; then
  STATE=auto
  if ! [[ $LAST_HOLIDAY == "" ]]; then
    LAST_HOLIDAY_DAY=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%Y-%m-%d')
    LAST_HOLIDAY_DAY=$(date -j -f '%Y-%m-%d' "$LAST_HOLIDAY_DAY" +'%A')
    if [[ $LAST_HOLIDAY_DAY == "Friday" ]]; then
      DATE_BACK=$(date -j -v +3d -f "%d.%m.%Y" "$LAST_HOLIDAY")
      DATE_BACK=$(date -j -f "%a %b %e %H:%M:%S %Z %Y" "$DATE_BACK" '+%d.%m.%Y')
      DATEBACK_MESSAGE=" (back on ${DATE_BACK})"
    else
      DATE_BACK=$(date -j -v +1d -f "%d.%m.%Y" "$LAST_HOLIDAY")
      DATE_BACK=$(date -j -f "%a %b %e %H:%M:%S %Z %Y" "$DATE_BACK" '+%d.%m.%Y')
      DATEBACK_MESSAGE=" (back on ${DATE_BACK})"
    fi
  else
    LAST_HOLIDAY=""
  fi

  if [[ $LAST_HOLIDAY == "" ]]; then
    TIMESTAMP="0"
  else
    TIMESTAMP_PARSE=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%Y:%m:%d 23:59:59')
    TIMESTAMP=$(date -j -f "%Y:%m:%d %H:%M:%S" "$TIMESTAMP_PARSE" +%s)
  fi
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$VACATION_MESSAGE $DATEBACK_MESSAGE\", \"status_emoji\" : \"$HOLIDAY_EMOJI\", \"status_expiration\": $TIMESTAMP } }"
  osascript -e 'display notification "'"$VACATION_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "holiday-off" ]]; then
  STATE=away
  if ! [[ $LAST_HOLIDAY == "" ]]; then
      LAST_HOLIDAY_DAY=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%Y-%m-%d')
      LAST_HOLIDAY_DAY=$(date -j -f '%Y-%m-%d' "$LAST_HOLIDAY_DAY" +'%A')
      if [[ $LAST_HOLIDAY_DAY == "Friday" ]]; then
        DATE_BACK=$(date -j -v +3d -f "%d.%m.%Y" "$LAST_HOLIDAY")
        DATE_BACK=$(date -j -f "%a %b %e %H:%M:%S %Z %Y" "$DATE_BACK" '+%d.%m.%Y')
        DATEBACK_MESSAGE=" (back on ${DATE_BACK})"
      else
        DATE_BACK=$(date -j -v +1d -f "%d.%m.%Y" "$LAST_HOLIDAY")
        DATE_BACK=$(date -j -f "%a %b %e %H:%M:%S %Z %Y" "$DATE_BACK" '+%d.%m.%Y')
        DATEBACK_MESSAGE=" (back on ${DATE_BACK})"
      fi
    else
      LAST_HOLIDAY=""
    fi

    if [[ $LAST_HOLIDAY == "" ]]; then
      TIMESTAMP="0"
    else
      TIMESTAMP_PARSE=$(date -j -f "%d.%m.%Y" "$LAST_HOLIDAY" '+%Y:%m:%d 23:59:59')
      TIMESTAMP=$(date -j -f "%Y:%m:%d %H:%M:%S" "$TIMESTAMP_PARSE" +%s)
    fi
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$VACATION_MESSAGE $DATEBACK_MESSAGE\", \"status_emoji\" : \"$HOLIDAY_EMOJI\", \"status_expiration\": $TIMESTAMP } }"
  echo $PAYLOAD
  osascript -e 'display notification "'"$VACATION_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  echo "not working" > ./logs/$STATUS_CHECK_FILE
fi

if [[ $STATUS == "meeting" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$MEETING_MESSAGE\", \"status_emoji\" : \"$MEETING_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$MEETING_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  activate_DND_call
fi

if [[ $STATUS == "dnd" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$FOCUS_MESSAGE\", \"status_emoji\" : \"$FOCUS_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$FOCUS_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  activate_DND_call
fi

if [[ $STATUS == "shopping" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$SHOPPING_MESSAGE\", \"status_emoji\" : \"$SHOPPING_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$SHOPPING_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "dog" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$DOG_MESSAGE\", \"status_emoji\" : \"$DOG_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$DOG_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "remeet" ]]; then
  STATE=auto
  PAYLOAD="{ \"profile\": { \"status_text\": \"$REMEET_MESSAGE\", \"status_emoji\": \"$REMEET_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$REMEET_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
  activate_DND_call
fi

if [[ $STATUS == "travel" ]]; then
  STATE=away
  PAYLOAD="{ \"profile\": { \"status_text\" : \"$TRAVEL_MESSAGE\", \"status_emoji\" : \"$TRAVEL_EMOJI\", \"status_expiration\": 0 } }"
  osascript -e 'display notification "'"$TRAVEL_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi