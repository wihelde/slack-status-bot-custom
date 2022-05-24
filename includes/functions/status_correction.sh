source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh
source ./includes/functions/zoom.sh
source ./includes/functions/spotify.sh
source ./includes/functions/remeet.sh
source ./includes/functions/remeet_virtual_desk.sh
source ./includes/functions/skype.sh
source ./includes/functions/microsoft_teams.sh
source ./includes/functions/discord.sh
source ./includes/functions/apple_music.sh

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
    ( ! inARemeetMeeting && [[ "$STATUS_EMOJI" == "$REMEET_EMOJI" && $STATUS_TEXT == "$REMEET_MESSAGE" ]] ) &&
      reset
    ( ! inARemeetMeetingVirtualDesk && [[ "$STATUS_EMOJI" == "$REMEET_VIRTUAL_DESK_EMOJI" && $STATUS_TEXT == "$REMEET_VIRTUAL_DESK_MESSAGE" ]] ) &&
      reset
    ( ! inASkypeMeeting && [[ "$STATUS_EMOJI" == "$SKYPE_EMOJI" ]] ) &&
      reset
    ( ! inAMicrosoftTeamsMeeting && [[ "$STATUS_EMOJI" == "$TEAMS_EMOJI" ]] ) &&
      reset
    ( ! inADiscordMeeting && [[ "$STATUS_EMOJI" == "$DISCORD_EMOJI" ]] ) &&
      reset
    ( ! isAppleMusicPlaying && [[ "$STATUS_EMOJI" == "$APPLE_MUSIC_EMOJI" ]] ) && reset
}