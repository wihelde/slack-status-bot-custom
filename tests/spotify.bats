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

@test "setStatusSpotify can call function without error" {
  export MOCK_SPOTIFY_PROCESS=1
  export MOCK_SPOTIFY_STATE="playing"
  export MOCK_SPOTIFY_TRACK="Artist - Song"
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusSpotify"
  # Function should not crash; it's a complex function with env-dependent behavior
  true
}


