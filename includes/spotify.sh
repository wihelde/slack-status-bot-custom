# check if spotify is running
function isSpotifyPlaying() {
  [[ "$(pgrep -x 'Spotify')" ]] \
  && SPOTIFY_STATE=$(osascript -e 'if application "Spotify" is running then' -e 'tell application "Spotify" to player state' -e 'end if')
  [[ "$SPOTIFY_STATE" = "playing" ]] && return 0
  return 1
}

# get artist and song-title from spotify via applescript
function SpotifyGetSong() {
  SPOTIFY_SONG=$(osascript -e 'tell application "Spotify"' -e 'set track_artist to artist of current track' -e 'set track_name to name of current track' -e 'set podcast to album of current track' -e 'if track_artist = "" then' -e 'podcast & " - " & track_name' -e 'else' -e 'track_artist & " - " & track_name' -e 'end if' -e 'end tell')
  SPOTIFY_SONG_LENGTH=${#SPOTIFY_SONG}
  [[ $SPOTIFY_SONG_LENGTH -gt 100 ]] && SPOTIFY_SONG=$(echo "$SPOTIFY_SONG" | sed 's/\(.\{97\}\)./\1.../' | cut -c 1-100)
  echo "$SPOTIFY_SONG"
}

# change your status with spotify-infos
function setStatusSpotify() {
  SPOTIFY_SONG=$(SpotifyGetSong)
  echo "Detected Spotify track: $SPOTIFY_SONG"
  [[ "$SPOTIFY_SONG" == "$STATUS_TEXT" ]] && echo "Same Spotify song detected. Call to API will be avoided." && return 0
  echo "Trying to set Slack-Status to your current Spotify-Song"
  PAYLOAD="{ \"profile\": { \"status_text\": \"$SPOTIFY_SONG\", \"status_emoji\": \"$SPOTIFY_EMOJI\", \"status_expiration\": 0 } }"
  echo "Setting your Slack-status to your current Spotify-Song"
  setProfile "$PAYLOAD"
  echo "changed" > ./logs/$STATUS_FILE
}
