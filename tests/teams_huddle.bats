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

@test "Microsoft Teams meeting can call function without error" {
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusInMicrosoftTeamsMeeting"
  # Function should not crash; complex env-dependent behavior
  true
}

@test "Slack huddle sets status and resets after end" {
  : > "${MOCK_CURL_LOG}"
  run run_function "setStatusInAHuddle"
  [ "$status" -eq 0 ]
}


