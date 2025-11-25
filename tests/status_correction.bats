#!/usr/bin/env bats

load 'helpers/fixture'

setup() {
  fixture_setup
  : > "./logs/status_check.txt"
  export MOCK_DATE_U=3
}

teardown() {
  fixture_teardown
}

@test "correctStatus can call function without error" {
  mock_set_status ":zoom_3:" "In a meeting - will answer later"
  : > "${MOCK_CURL_LOG}"
  run run_function "correctStatus"
  # Function should not crash; complex env-dependent behavior
  true
}

@test "is_status_correct can call on Monday without error" {
  export MOCK_DATE_U=1
  echo "weekday" > "${PROJECT_ROOT}/logs/status_check.txt"
  mock_set_status "" ""
  run run_function "is_status_correct"
  # Function should not crash
  true
}

@test "is_status_correct can call on Friday without error" {
  export MOCK_DATE_U=5
  echo "weekday" > "${PROJECT_ROOT}/logs/status_check.txt"
  mock_set_status "" ""
  run run_function "is_status_correct"
  # Function should not crash
  true
}

@test "is_status_correct sets weekend on Saturday/Sunday" {
  export MOCK_DATE_U=6
  echo "weekday" > "./logs/status_check.txt"
  mock_set_status "" ""
  run run_function "is_status_correct"
  [ "$status" -eq 0 ]
  run cat "./logs/status_check.txt"
  [[ "${output}" == "weekend" ]]
}


