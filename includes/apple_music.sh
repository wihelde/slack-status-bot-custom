# check if apple music is running
function isAppleMusicPlaying() {
  APPLE_MUSIC_STATE=$(osascript -e 'if application "Music" is running then' -e 'tell application "Music" to player state' -e 'end if')
  [[ "$APPLE_MUSIC_STATE" = "playing" ]] && return 0
  return 1
}

# get artist and song-title from apple Music via applescript
function AppleGetSong() {
  APPLE_SONG=$(osascript -e 'tell application "Music" to artist of current track & " - " & name of current track')
  APPLE_SONG_LENGTH=${#SPOTIFY_SONG}
  [[ $APPLE_SONG_LENGTH -gt 100 ]] && APPLE_SONG=$(echo "$APPLE_SONG" | sed 's/\(.\{97\}\)./\1.../' | cut -c 1-100)
  echo "$APPLE_SONG"
}

# change your status with apple music-infos
function setStatusAppleMusic() {
  APPLE_MUSIC_SONG=$(AppleGetSong)
  echo "Detected Apple Music track: $APPLE_MUSIC_SONG"
  [[ "$APPLE_MUSIC_SONG" == "$STATUS_TEXT" ]] && echo "Same Apple Music song detected. Call to API will be avoided." && return 0
  echo "Trying to set Slack-Status to your current Apple Music-Song"
  PAYLOAD="{ \"profile\": { \"status_text\": \"$APPLE_MUSIC_SONG\", \"status_emoji\": \"$APPLE_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to your current Apple Music-Song"
  setProfile "$PAYLOAD"
  echo "changed" > ./logs/$STATUS_FILE
}
