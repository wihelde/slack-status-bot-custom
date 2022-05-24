source ./includes/functions/shortcuts_app.sh
source ./includes/functions/DND.sh
source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh
source ./includes/functions/remeet_virtual_desk.sh

# check if apple music is running
function isAppleMusicPlaying() {
  APPLE_MUSIC_STATE=$(osascript -e 'try' -e 'if application "Music" is running then' -e 'tell application "Music" to player state' -e 'end if' -e 'end try')
  [[ "$APPLE_MUSIC_STATE" == "playing" ]] && return 0
  return 1
}

# get artist and song-title from apple Music via applescript
function AppleGetSong() {
  APPLE_SONG=$(osascript -e 'try' -e 'if application "Music" is running then' -e 'tell application "Music" to artist of current track & " - " & name of current track' -e 'end if' -e 'end try')
  APPLE_SONG_LENGTH=${#APPLE_SONG}
  # since cut only "cutts" when string is longer than 100 chars, cut can be applied always
  APPLE_SONG=$(echo "$APPLE_SONG" | sed 's/\(.\{97\}\)./\1.../' | cut -c -100)
  echo "$APPLE_SONG"
}

# change your status with apple music-infos
function setStatusAppleMusic() {
  APPLE_MUSIC_SONG=$(AppleGetSong)
  ( ! inARemeetMeetingVirtualDesk && isAppleMusicPlaying ) &&
    echo "Detected Apple Music track: $APPLE_MUSIC_SONG" &&
    [[ $FINAL_STATUS == "$APPLE_MUSIC_SONG" ]] &&
    echo "Same Apple Music Song detected. Call to API will be avoided."
  ( ! inARemeetMeetingVirtualDesk && isAppleMusicPlaying && [[ $FINAL_STATUS != "$APPLE_MUSIC_SONG" ]] && isStatusClean ) &&
    export FINAL_STATUS="$APPLE_MUSIC_SONG" &&
    echo "Trying to set Slack-Status to your current Apple Music-Song" &&
    PAYLOAD="{ \"profile\": { \"status_text\": \"$APPLE_MUSIC_SONG\", \"status_emoji\": \"$APPLE_MUSIC_EMOJI\", \"status_expiration\": 0 } }" &&
    echo "Setting your Slack-status to your current Apple Music-Song" &&
    setProfile "$PAYLOAD"
  ( ! inARemeetMeetingVirtualDesk && ! isAppleMusicPlaying && [[ $FINAL_STATUS == "$APPLE_MUSIC_SONG" && "$APPLE_MUSIC_SONG" != "" ]] ) &&
    reset
}