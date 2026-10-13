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

@test "correction restores the weekday profile after Zoom ends" {
  mock_set_status ":zoom_3:" "In a meeting - will answer later"
  : > "${MOCK_CURL_LOG}"
  run run_function "correctStatus"
  assert_profile ":shark:" "Working"
  assert_call_count 'users.profile.set' 1
  assert_call_count 'dnd.endDnd' 1
}

@test "Monday correction sends the Monday profile and online presence" {
  export MOCK_DATE_U=1
  echo "weekday" > "${PROJECT_ROOT}/logs/status_check.txt"
  mock_set_status "" ""
  run run_function "is_status_correct"
  assert_profile ":monday:" "Pretty sure I smell a Monday here ..."
  assert_call_count 'users.setPresence' 1
  [ "$(cat ./logs/status_check.txt)" = monday ]
}

@test "Friday correction sends the Friday profile and online presence" {
  export MOCK_DATE_U=5
  echo "weekday" > "${PROJECT_ROOT}/logs/status_check.txt"
  mock_set_status "" ""
  run run_function "is_status_correct"
  assert_profile ":tgif:" "TGIF!"
  assert_call_count 'users.setPresence' 1
  [ "$(cat ./logs/status_check.txt)" = friday ]
}

@test "is_status_correct sets weekend on Saturday/Sunday" {
  export MOCK_DATE_U=6
  echo "weekday" > "./logs/status_check.txt"
  mock_set_status "" ""
  run run_function "is_status_correct"
  [ "$status" -eq 0 ]
  run cat "./logs/status_check.txt"
  [[ "${output}" == "weekend" ]]
  assert_profile ":mobile_phone_off:" "Offline"
}

@test "daily correction preserves protected status and its tracking state" {
  export MOCK_DATE_U=1
  echo "not working" > ./logs/status_check.txt
  mock_set_status ":palm_tree:" "Vacation"
  run run_function "correctStatus"
  assert_call_count 'users.profile.set' 0
  assert_call_count 'users.setPresence' 0
  [ "$(cat ./logs/status_check.txt)" = "not working" ]
}


