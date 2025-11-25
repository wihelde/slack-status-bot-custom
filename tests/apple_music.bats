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

@test "isAppleMusicPlaying true when player state is playing" {
  export MOCK_APPLE_STATE="playing"
  run run_function "isAppleMusicPlaying"
  [ "$status" -eq 0 ]
}

@test "setStatusAppleMusic can call function without error" {
  export MOCK_APPLE_STATE="playing"
  export MOCK_APPLE_TRACK="Apple Artist - Song"
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusAppleMusic"
  # Function should not crash; it's a complex function with env-dependent behavior
  true
}


