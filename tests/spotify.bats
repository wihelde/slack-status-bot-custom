#!/usr/bin/env bats

load 'helpers/fixture'

setup() {
  fixture_setup
  : > "./logs/status_check.txt"
  export MOCK_DATE_U=3
  export MOCK_JQ_STATUS_EMOJI=""
  export MOCK_JQ_STATUS_TEXT=""
}

teardown() {
  fixture_teardown
}

@test "isSpotifyPlaying true when process exists and state playing" {
  export MOCK_SPOTIFY_PROCESS=1
  export MOCK_SPOTIFY_STATE="playing"
  run run_function "isSpotifyPlaying"
  [ "$status" -eq 0 ]
}

@test "Spotify sends the playing track as the Slack profile" {
  export MOCK_SPOTIFY_PROCESS=1
  export MOCK_SPOTIFY_STATE="playing"
  export MOCK_SPOTIFY_TRACK="Artist - Song"
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusSpotify"
  assert_profile ":spotify_2:" "Artist - Song"
  assert_call_count 'users.profile.set' 1
}

@test "Spotify does not send the same track twice" {
  export MOCK_SPOTIFY_PROCESS=1 MOCK_SPOTIFY_STATE=playing
  export MOCK_SPOTIFY_TRACK="Artist - Song" FINAL_STATUS="Artist - Song"
  run run_function "setStatusSpotify"
  assert_call_count 'users.profile.set' 0
}

@test "Spotify restores the weekday profile after playback stops" {
  export MOCK_SPOTIFY_TRACK="Artist - Song" FINAL_STATUS="Artist - Song"
  run run_function "setStatusSpotify"
  assert_profile ":shark:" "Working"
  assert_call_count 'dnd.endDnd' 1
}

@test "Spotify preserves a protected user status" {
  export MOCK_SPOTIFY_PROCESS=1 MOCK_SPOTIFY_STATE=playing
  mock_set_status ":palm_tree:" "Vacation"
  echo "not working" > ./logs/status_check.txt
  run run_function "setStatusSpotify"
  assert_call_count 'users.profile.set' 0
}


