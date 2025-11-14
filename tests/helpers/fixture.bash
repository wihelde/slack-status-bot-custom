#!/usr/bin/env bash

# Test fixture helpers for Bats tests
#
# Responsibilities:
# - Prepare PATH to include mock binaries
# - Create a fake .token and logs directory
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
  PROJECT_ROOT="$(cd "${test_dir}/.." && pwd)"
  export PROJECT_ROOT
}

fixture_setup() {
  fixture_project_root
  cd "${PROJECT_ROOT}" || exit 1

  export MOCKS_DIR="${PROJECT_ROOT}/tests/__mocks__/bin"
  export PATH="${MOCKS_DIR}:${PATH}"

  # Log file for mock curl
  export MOCK_CURL_LOG="${PROJECT_ROOT}/tests/__mocks__/calls.log"
  : > "${MOCK_CURL_LOG}"

  # Ensure logs directory
  mkdir -p "${PROJECT_ROOT}/logs"
  # Fresh status_check file
  : > "${PROJECT_ROOT}/logs/status_check.txt"

  # Fake token
  echo "xoxb-test-token" > "${PROJECT_ROOT}/.token"

  # Default mock date (Wednesday)
  export MOCK_DATE_U="${MOCK_DATE_U:-3}"

  # Default presence
  export MOCK_JQ_PRESENCE="${MOCK_JQ_PRESENCE:-active}"
}

fixture_teardown() {
  cd "${PROJECT_ROOT}" || true
  # Keep logs and calls for inspection; clean only ephemeral if needed
  # rm -f "${PROJECT_ROOT}/.token"
  true
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
  
  bash -c "
    # Set up environment
    export MOCKS_DIR='${MOCKS_DIR}'
    export PROJECT_ROOT='${PROJECT_ROOT}'
    export MOCK_JQ_STATUS_EMOJI='${MOCK_JQ_STATUS_EMOJI}'
    export MOCK_JQ_STATUS_TEXT='${MOCK_JQ_STATUS_TEXT}'
    export MOCK_DATE_U='${MOCK_DATE_U}'
    export MOCK_JQ_PRESENCE='${MOCK_JQ_PRESENCE}'
    export MOCK_CURL_LOG='${MOCK_CURL_LOG}'
    export FINAL_STATUS='${FINAL_STATUS}'
    export FINAL_DND_STATUS='${FINAL_DND_STATUS}'
    export DATE='${DATE}'
    
    export PATH=\"\${MOCKS_DIR}:\${PATH}\"
    cd \"\${PROJECT_ROOT}\"
    
    # Source all helpers first
    source ./includes/helper/misc.sh 2>/dev/null || true
    source ./includes/helper/custom_status_messages.sh 2>/dev/null || true
    source ./includes/functions/DND.sh 2>/dev/null || true
    source ./includes/functions/slack.sh 2>/dev/null || true
    source ./includes/functions/spotify.sh 2>/dev/null || true
    source ./includes/functions/apple_music.sh 2>/dev/null || true
    source ./includes/functions/zoom.sh 2>/dev/null || true
    source ./includes/functions/huddle.sh 2>/dev/null || true
    source ./includes/functions/microsoft_teams.sh 2>/dev/null || true
    source ./includes/functions/status_correction.sh 2>/dev/null || true
    
    # Override jq to use mock (must be AFTER misc.sh which sets it)
    jq=\"\${MOCKS_DIR}/jq\"
    export jq
    
    # Then call the function
    ${func} \"\$@\"
  "
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


