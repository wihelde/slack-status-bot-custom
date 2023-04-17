source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh
source ./includes/functions/zoom.sh
source ./includes/functions/spotify.sh
source ./includes/functions/microsoft_teams.sh
source ./includes/functions/apple_music.sh

# check if your status is still correct
function is_status_correct() {
    DOW=$(date +%u)
    # message for monday
    STATUS_CHECK=$(cat ./logs/$STATUS_CHECK_FILE)
    [[ $DOW == "1" && $STATUS_CHECK != "monday" && $STATUS_CHECK != "not working" ]] && isStatusClean &&
      echo "monday" > ./logs/$STATUS_CHECK_FILE &&
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$MONDAY_MESSAGE\", \"status_emoji\" : \"$MONDAY_EMOJI\", \"status_expiration\": 0 } }" &&
      osascript -e 'display notification "'"$MONDAY_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
      setProfile "$PAYLOAD" &&
      STATE="auto" &&
      changePresence "$STATE"
    # message for all other workdays
    [[ ( $DOW = "2" || $DOW = "3" || $DOW = "4" ) && ( $STATUS_CHECK != "weekday" && $STATUS_CHECK != "not working" ) ]] && isStatusClean &&
      echo "weekday" > ./logs/$STATUS_CHECK_FILE &&
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }" &&
      osascript -e 'display notification "'"$ON_MESSAGE_FINAL"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
      setProfile "$PAYLOAD" &&
      STATE="auto" &&
      changePresence "$STATE"
    # message for friday
    [[ $DOW == "5" && ( $STATUS_CHECK != "friday" && $STATUS_CHECK != "not working" ) ]] && isStatusClean &&
      echo "friday" > ./logs/$STATUS_CHECK_FILE &&
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$TGIF_MESSAGE\", \"status_emoji\" : \"$TGIF_EMOJI\", \"status_expiration\": 0 } }" &&
      osascript -e 'display notification "'"$TGIF_MESSAGE"'" with title "Slack Status Bot" subtitle "Your status is reset to ... " sound name "Glass"' &&
      setProfile "$PAYLOAD" &&
      STATE="auto" &&
      changePresence "$STATE"
    # message for weekend
    [[ ( $DOW = "6" || $DOW = "7" ) && $STATUS_CHECK != "not working" && $STATUS_CHECK != "weekend" ]] && isStatusClean &&
      echo "weekend" > ./logs/$STATUS_CHECK_FILE &&
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$OFFLINE_MESSAGE\", \"status_emoji\" : \"$OFF_EMOJI\", \"status_expiration\": 0 } }" &&
      setProfile "$PAYLOAD" &&
      STATE="auto" &&
      changePresence "$STATE"
}

function correctStatus() {
  for i in "${LEGACY_TOKEN_ARRAY[@]}"; do
      JSON=$(curl -X GET -H "Authorization: Bearer $i" -H "Content-Type: application/json; charset=UTF-8" -s "https://slack.com/api/users.profile.get")
      STATUS_EMOJI=$(echo "$JSON" | $jq '.profile.status_emoji' | sed 's/\"//g')
      STATUS_TEXT=$(echo "$JSON" | $jq '.profile.status_text' | sed 's/\"//g')
  done

    ( ! inAMeeting && [[ "$STATUS_EMOJI" == "$ZOOM_EMOJI" ]] ) &&
      reset
    ( ! isSpotifyPlaying && [[ "$STATUS_EMOJI" == "$SPOTIFY_EMOJI" ]] ) &&
      reset
    ( ! inAMicrosoftTeamsMeeting && [[ "$STATUS_EMOJI" == "$TEAMS_EMOJI" ]] ) &&
      reset
    ( ! isAppleMusicPlaying && [[ "$STATUS_EMOJI" == "$APPLE_MUSIC_EMOJI" ]] ) && reset
    is_status_correct
}
