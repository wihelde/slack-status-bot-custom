#!/usr/bin/env bats

load 'helpers/fixture'

setup() {
  fixture_setup
  # Ensure deterministic weekday (not relevant here)
  export MOCK_DATE_U=3
  # Fresh log
  : > "./logs/status_check.txt"
}

teardown() {
  fixture_teardown
}

@test "isStatusClean allows ON_EMOJI" {
  mock_set_status ":shark:" ""
  run run_function "isStatusClean"
  [ "$status" -eq 0 ]
}

@test "isStatusClean blocks unknown emoji when status_check is active" {
  # When status_check is NOT "not working", unknown emojis should be blocked
  echo "weekday" > "${PROJECT_ROOT}/logs/status_check.txt"
  mock_set_status ":not_a_known_emoji:" "X"
  run run_function "isStatusClean"
  [ "$status" -ne 0 ]
}

@test "isStatusClean allows empty status" {
  mock_set_status "" ""
  run run_function "isStatusClean"
  [ "$status" -eq 0 ]
}


