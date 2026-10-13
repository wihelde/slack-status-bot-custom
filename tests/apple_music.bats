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

@test "Apple Music sends the playing track as the Slack profile" {
  export MOCK_APPLE_STATE="playing"
  export MOCK_APPLE_TRACK="Apple Artist - Song"
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusAppleMusic"
  assert_profile ":apple_music:" "Apple Artist - Song"
  assert_call_count 'users.profile.set' 1
}

@test "Apple Music does not send the same track twice" {
  export MOCK_APPLE_STATE=playing MOCK_APPLE_TRACK="Apple Artist - Song"
  export FINAL_STATUS="Apple Artist - Song"
  run run_function "setStatusAppleMusic"
  assert_call_count 'users.profile.set' 0
}

@test "Apple Music restores the weekday profile after playback stops" {
  export MOCK_APPLE_TRACK="Apple Artist - Song" FINAL_STATUS="Apple Artist - Song"
  run run_function "setStatusAppleMusic"
  assert_profile ":shark:" "Working"
  assert_call_count 'dnd.endDnd' 1
}

@test "Apple Music preserves a protected user status" {
  export MOCK_APPLE_STATE=playing
  mock_set_status ":palm_tree:" "Vacation"
  echo "not working" > ./logs/status_check.txt
  run run_function "setStatusAppleMusic"
  assert_call_count 'users.profile.set' 0
}


