#!/usr/bin/env bats

load 'helpers/fixture'

setup() {
  fixture_setup
  : > "./logs/status_check.txt"
  # Ensure jq returns empty current status so isStatusClean allows change
  export MOCK_JQ_STATUS_EMOJI=""
  export MOCK_JQ_STATUS_TEXT=""
}

teardown() {
  fixture_teardown
}

@test "reset on Monday sets monday payload and log" {
  export MOCK_DATE_U=1
  : > "${MOCK_CURL_LOG}"
  run run_function "reset"
  [ "$status" -eq 0 ]
  run cat "${PROJECT_ROOT}/logs/status_check.txt"
  [[ "${output}" == "monday" ]]
  assert_profile ":monday:" "Pretty sure I smell a Monday here ..."
}

@test "reset on Friday sets friday payload and log" {
  export MOCK_DATE_U=5
  : > "${MOCK_CURL_LOG}"
  run run_function "reset"
  [ "$status" -eq 0 ]
  run cat "${PROJECT_ROOT}/logs/status_check.txt"
  [[ "${output}" == "friday" ]]
  assert_profile ":tgif:" "TGIF!"
}

@test "reset on weekday sets weekday payload and log" {
  export MOCK_DATE_U=3
  : > "${MOCK_CURL_LOG}"
  run run_function "reset"
  [ "$status" -eq 0 ]
  run cat "${PROJECT_ROOT}/logs/status_check.txt"
  [[ "${output}" == "weekday" ]]
  assert_profile ":shark:" "Working"
}


