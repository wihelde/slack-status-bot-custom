#!/bin/bash
function chrome_json_summary() {
local wincount=$(osascript -e 'tell application "Google Chrome" to get number of windows')
[ "$wincount" -eq 0 ] && echo "zero windows!" && return

local json="["
for (( i=1; i<=$wincount; i++)); do
    json="$json""["
    local cmd="osascript -e 'tell application \"Google Chrome\" to get number of tabs in window $i'"
    local tabcount=$(eval $cmd)
    for (( j=1; j<=$tabcount; j++)); do
        local cmd="osascript -e 'tell application \"Google Chrome\" to get URL of tab $j of window $i'"
        local url=$(eval $cmd)
        [ $j -eq $tabcount ] && json="$json\"$url\"" || json="$json\"$url\","
   done
   [ $i -eq $wincount ] && json="$json]" || json="$json],"
done
echo "$json]"
}

function inARemeetMeeting() {
  CHROME="osascript -e 'tell application \"System Events\" to (name of processes) contains \"Google Chrome\"'"
  if test "$(eval "$CHROME")" = "true"; then
  osascript <<EOF
if application "Google Chrome" is running then

set titleString to ""

tell application "Google Chrome"
set window_list to every window # get the windows
repeat with the_window in window_list # for every window
    set tab_list to every tab in the_window # get the tabs
    repeat with the_tab in tab_list # for every tab
        set the_url to the URL of the_tab # grab the URL
        set titleString to titleString & the_url & "\n"
    end repeat
end repeat
end tell
end if
EOF
fi
}

#chrome_json_summary
inARemeetMeeting