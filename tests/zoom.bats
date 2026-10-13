#!/usr/bin/env bats

load 'helpers/fixture'

setup() {
  fixture_setup
  : > "./logs/status_check.txt"
  export MOCK_DATE_U=3
  # isStatusClean should allow change
  export MOCK_JQ_STATUS_EMOJI=""
  export MOCK_JQ_STATUS_TEXT=""
}

teardown() {
  fixture_teardown
}

@test "setStatusInMeeting sets FINAL_STATUS when Zoom active" {
  export MOCK_IN_ZOOM=1
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusInMeeting"
  [ "$status" -eq 0 ]
  assert_profile ":zoom_3:" "In a meeting - will answer later"
  assert_call_count 'dnd.setSnooze' 1
}

@test "setStatusInMeeting triggers reset when Zoom ends" {
  export FINAL_STATUS="inAZoomCall"
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusInMeeting"
  [ "$status" -eq 0 ]
  assert_profile ":shark:" "Working"
  assert_call_count 'dnd.endDnd' 1
}

@test "Zoom does not repeat profile or DND requests during the same call" {
  export MOCK_IN_ZOOM=1 FINAL_STATUS=inAZoomCall FINAL_DND_STATUS=DNDActive
  run run_function "setStatusInMeeting"
  [ "$status" -eq 0 ]
  assert_call_count 'users.profile.set' 0
  assert_call_count 'dnd.setSnooze' 0
}

@test "Zoom preserves a protected user status without enabling DND" {
  export MOCK_IN_ZOOM=1
  mock_set_status ":palm_tree:" "Vacation"
  echo "not working" > ./logs/status_check.txt
  run run_function "setStatusInMeeting"
  [ "$status" -eq 0 ]
  assert_call_count 'users.profile.set' 0
  assert_call_count 'dnd.setSnooze' 0
}


