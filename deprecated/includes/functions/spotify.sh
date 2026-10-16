source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh

# check if spotify is running
function isSpotifyPlaying() {
  [[ "$(pgrep -x 'Spotify')" ]] &&
    SPOTIFY_STATE=$(osascript -e 'try' -e 'if application "Spotify" is running then' -e 'tell application "Spotify" to player state' -e 'end if' -e 'end try')
  [[ "$SPOTIFY_STATE" == "playing" ]] && return 0
  return 1
}

# get artist and song-title from spotify via applescript
function SpotifyGetSong() {
  SPOTIFY_SONG=$(osascript -e 'try' -e 'if application "Spotify" is running then' -e 'tell application "Spotify"' -e 'set track_artist to artist of current track' -e 'set track_name to name of current track' -e 'set podcast to album of current track' -e 'if track_artist = "" then' -e 'podcast & " - " & track_name' -e 'else' -e 'track_artist & " - " & track_name' -e 'end if' -e 'end tell' -e 'end if' -e 'end try')
  SPOTIFY_SONG_LENGTH=${#SPOTIFY_SONG}
   # since cut only "cutts" when string is longer than 100 chars, cut can be applied always
  SPOTIFY_SONG=$(echo "$SPOTIFY_SONG" | sed 's/\(.\{97\}\)./\1.../' | cut -c -100)
  echo "$SPOTIFY_SONG"
}

# change your status with spotify-infos
function setStatusSpotify() {
  SPOTIFY_SONG=$(SpotifyGetSong)
  ( isSpotifyPlaying ) &&
    echo "$DATE: Detected Spotify track: $SPOTIFY_SONG" &&
    [[ $FINAL_STATUS == "$SPOTIFY_SONG" ]] &&
    echo "$DATE: Same Spotify song detected. Call to API will be avoided."
  ( isSpotifyPlaying && [[ $FINAL_STATUS != "$SPOTIFY_SONG" ]] && isStatusClean ) &&
    export FINAL_STATUS="$SPOTIFY_SONG" &&
    echo "$DATE: Trying to set Slack-Status to your current Spotify-Song" &&
    PAYLOAD="{ \"profile\": { \"status_text\": \"$SPOTIFY_SONG\", \"status_emoji\": \"$SPOTIFY_EMOJI\", \"status_expiration\": 0 } }" &&
    echo "$DATE: Setting your Slack-status to your current Spotify-Song" &&
    setProfile "$PAYLOAD"
  ( ! isSpotifyPlaying && [[ $FINAL_STATUS == "$SPOTIFY_SONG" && "$SPOTIFY_SONG" != "" ]] ) &&
    reset
}
