#!/usr/bin/env bash

# Test fixture helpers for Bats tests
#
# Responsibilities:
# - Prepare PATH to include mock binaries
# - Isolate fake credentials and logs in Bats' temporary directory
# - Provide helpers to source modules with mocked jq
# - Provide helpers to control mock outputs
#
# Usage in .bats files:
#   load 'helpers/fixture'
#   setup() { fixture_setup; }
#   teardown() { fixture_teardown; }
#

fixture_project_root() {
  # bats sets BATS_TEST_FILENAME to the current test file; go two levels up to project root
  local test_dir
  test_dir="$(cd "$(dirname "${BATS_TEST_FILENAME}")" && pwd)"
  REPOSITORY_ROOT="$(cd "${test_dir}/.." && pwd)"
  export REPOSITORY_ROOT
}

fixture_setup() {
  fixture_project_root
  export PROJECT_ROOT="${BATS_TEST_TMPDIR}/runtime"
  mkdir -p "${PROJECT_ROOT}/logs"
  ln -s "${REPOSITORY_ROOT}/includes" "${PROJECT_ROOT}/includes"
  cd "${PROJECT_ROOT}" || exit 1

  export MOCKS_DIR="${REPOSITORY_ROOT}/tests/__mocks__/bin"
  export PATH="${MOCKS_DIR}:${PATH}"

  # Log file for mock curl
  export MOCK_CURL_LOG="${PROJECT_ROOT}/calls.log"
  : > "${MOCK_CURL_LOG}"

  # Fresh status_check file
  : > "${PROJECT_ROOT}/logs/status_check.txt"

  # Fake token
  echo "xoxb-test-token" > "${PROJECT_ROOT}/.token"

  # Default mock date (Wednesday)
  export MOCK_DATE_U=3

  # Default presence
  export MOCK_JQ_PRESENCE=active
  export MOCK_JQ_STATUS_EMOJI="" MOCK_JQ_STATUS_TEXT=""
  export MOCK_SPOTIFY_PROCESS=0 MOCK_SPOTIFY_STATE=paused MOCK_APPLE_STATE=paused
  export MOCK_IN_ZOOM=0 MOCK_IN_HUDDLE=0 MOCK_IN_TEAMS=0
  export FINAL_STATUS="" FINAL_DND_STATUS="" ENABLE_FOCUS_SWITCH=yes
}

fixture_teardown() {
  cd "${REPOSITORY_ROOT}" || return
}

# Source a script and then ensure jq variable points to our mock
source_with_jq() {
  local file="$1"
  # shellcheck disable=SC1090
  source "${PROJECT_ROOT}/includes/helper/misc.sh" 2>/dev/null || true
  source "${PROJECT_ROOT}/includes/helper/custom_status_messages.sh" 2>/dev/null || true
  source "${file}"
  export jq="${MOCKS_DIR}/jq"
}

# Execute a function in a new bash context with proper environment
run_function() {
  local func="$1"
  shift
  
  bash -c '
    cd "${PROJECT_ROOT}" || exit 1
    # Source all helpers first
    source ./includes/functions/status_correction.sh
    
    # Override jq to use mock (must be AFTER misc.sh which sets it)
    jq="${MOCKS_DIR}/jq"
    export jq
    
    # Make random weekday defaults deterministic without replacing status logic.
    for index in "${!ON_MESSAGE[@]}"; do
      ON_MESSAGE[$index]="Working"
      ON_EMOJI[$index]=":shark:"
    done
    ON_MESSAGE_FINAL="Working"
    ON_EMOJI_FINAL=":shark:"
    OFFLINE_MESSAGE="Offline"
    "$@"
  ' bash "$func" "$@"
}

# Configure mocked profile status values that jq will output
mock_set_status() {
  local emoji="$1"
  local text="$2"
  export MOCK_JQ_STATUS_EMOJI="${emoji}"
  export MOCK_JQ_STATUS_TEXT="${text}"
}

# Helpers to inspect mock curl calls
mock_curl_calls() {
  cat "${MOCK_CURL_LOG}"
}

mock_curl_grep() {
  grep -E "$1" "${MOCK_CURL_LOG}" || true
}

# Check the actual JSON sent to Slack, including its text and expiration.
assert_profile() {
  python3 - "${MOCK_CURL_LOG}" "$1" "$2" <<'PY'
import json, re, sys
calls = [line for line in open(sys.argv[1]) if 'https://slack.com/api/users.profile.set' in line]
assert calls, 'No Slack profile update was sent'
payload = re.search(r'-d (.*) https://slack.com/api/users.profile.set', calls[-1]).group(1)
assert json.loads(payload)['profile'] == {
    'status_text': sys.argv[3], 'status_emoji': sys.argv[2], 'status_expiration': 0,
}
PY
}

assert_call_count() {
  local count
  count=$(mock_curl_grep "$1" | wc -l | tr -d ' ')
  [ "$count" -eq "$2" ]
}


