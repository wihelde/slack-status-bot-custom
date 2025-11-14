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
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusInMeeting"
  [ "$status" -eq 0 ]
}

@test "setStatusInMeeting triggers reset when Zoom ends" {
  export FINAL_STATUS="inAZoomCall"
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusInMeeting"
  [ "$status" -eq 0 ]
}


