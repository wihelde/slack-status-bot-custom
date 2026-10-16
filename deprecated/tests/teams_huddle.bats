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

@test "Microsoft Teams meeting sends its profile and enables DND" {
  export MOCK_IN_TEAMS=1
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusInMicrosoftTeamsMeeting"
  assert_profile ":teams:" "In a meeting - will answer later"
  assert_call_count 'dnd.setSnooze' 1
}

@test "Slack huddle sends its profile and enables DND" {
  export MOCK_IN_HUDDLE=1
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusInAHuddle"
  [ "$status" -eq 0 ]
  assert_profile ":headphones:" "In a huddle - will answer later"
  assert_call_count 'dnd.setSnooze' 1
}

@test "Microsoft Teams restores the weekday profile and disables DND after the call" {
  export FINAL_STATUS=inAMicrosoftTeamsCall
  run run_function "setStatusInMicrosoftTeamsMeeting"
  assert_profile ":shark:" "Working"
  assert_call_count 'dnd.endDnd' 1
}

@test "Slack huddle restores the weekday profile and disables DND after the call" {
  export FINAL_STATUS=inAhuddle
  run run_function "setStatusInAHuddle"
  assert_profile ":shark:" "Working"
  assert_call_count 'dnd.endDnd' 1
}


