function setProfile() {
  LEGACY_TOKEN_ARRAY_FINAL=("$@")
  for i in "${LEGACY_TOKEN_ARRAY[@]}";
  do
    curl -X POST -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set"
  done
}

function changeStatus() {
  LEGACY_TOKEN_ARRAY_FINAL=("$@")
  for i in "${LEGACY_TOKEN_ARRAY[@]}";
  do
    curl -s --data token="$i" \
    --data presence="$STATE" \
    https://slack.com/api/users.setPresence | \
    grep -Eq '"ok": ?true' && \
    echo "Away status updated ok" || \
    echo "There was a problem updating the away status"
  done
}

STATUS="$1"

if [[ $STATUS == "on" ]]; then
    STATE=auto
    # message for monday
    DeactivateDND
    if [[ $DOW == "1" ]]; then
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$MONDAY_MESSAGE\", \"status_emoji\" : \"$MONDAY_EMOJI\", \"status_expiration\": 0 } }"
      osascript -e 'display notification "'"$MONDAY_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    # message for friday
    elif [[ $DOW == "5" ]]; then
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$TGIF_MESSAGE\", \"status_emoji\" : \"$TGIF_EMOJI\", \"status_expiration\": 0 } }"
      osascript -e 'display notification "'"$TGIF_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    # message for all other days
    else
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }"
      osascript -e 'display notification "'"$ON_MESSAGE_FINAL"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    fi
fi

if [[ $STATUS == "off" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$OFFLINE_MESSAGE\", \"status_emoji\" : \"$OFF_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$OFFLINE_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "sick-on" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$SICK_MESSAGE\", \"status_emoji\" : \"$SICK_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$SICK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "sick-off" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$SICK_MESSAGE sick\", \"status_emoji\" : \"$SICK_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$SICK_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
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
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$VACATION_MESSAGE\", \"status_emoji\" : \"$HOLIDAY_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$VACATION_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "holiday-off" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$VACATION_MESSAGE\", \"status_emoji\" : \"$HOLIDAY_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$VACATION_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "meeting" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$MEETING_MESSAGE\", \"status_emoji\" : \"$MEETING_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$MEETING_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
fi

if [[ $STATUS == "dnd" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$FOCUS_MESSAGE\", \"status_emoji\" : \"$FOCUS_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$FOCUS_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    activateDND
fi

if [[ $STATUS == "sport" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$SPORT_MESSAGE\", \"status_emoji\" : \"$SPORT_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$SPORT_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
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

if [[ $STATUS == "skype" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$SKYPE\", \"status_emoji\" : \"$SKYPE_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$SKYPE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    activateDND
fi

if [[ $STATUS == "teams" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$TEAMS_MESSAGE\", \"status_emoji\" : \"$TEAMS_EMOJI\", \"status_expiration\": 0 } }"
    osascript -e 'display notification "'"$TEAMS_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"'
    activateDND
fi
