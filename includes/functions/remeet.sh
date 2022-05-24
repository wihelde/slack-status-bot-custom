source ./includes/functions/shortcuts_app.sh
source ./includes/functions/DND.sh
source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/slack.sh

# check if you are in a meeting in Chrome
function inARemeetMeeting() {
#  lsof -i -P -n 2>&1 | grep 'Google\|com.apple\|plugin-co' | grep -E "[[:<:]]([0-9]{2}u)[[:>:]]" | grep UDP | grep -E "([0-9]{1,3}[\.]){3}[0-9]{1,3}[\:]([0-9]{5})$" >/dev/null
   # $chrome-cli list links | grep 'https://esome.remeet.com/meet/' >/dev/null
  CHROME="osascript -e 'tell application \"System Events\" to (name of processes) contains \"Google Chrome\"'"
  if test "$(eval "$CHROME")" = "true"; then
  osascript <<EOF
try
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
end try
EOF
fi | grep https://esome.remeet.com/meet/ | grep -v https://example.invalid/private-meeting >/dev/null
}

## check if you are in a meeting in Safari
#function inARemeetMeeting() {
#  Safari="osascript -e 'tell application \"System Events\" to (name of processes) contains \"Safari\"'"
#  if test "$(eval "$Safari")" = "true"; then
#  osascript <<EOF
#set titleString to ""
#
#tell application "Safari"
#set window_list to every window # get the windows
#repeat with the_window in window_list # for every window
#    set tab_list to every tab in the_window # get the tabs
#    repeat with the_tab in tab_list # for every tab
#        set the_url to the URL of the_tab # grab the URL
#        set titleString to titleString & the_url & "\n"
#    end repeat
#end repeat
#end tell
#EOF
#fi | grep https://esome.remeet.com/meet/ >/dev/null
#}

## check if you are in a meeting in Brave Browser
#function inARemeetMeeting() {
#  Brave="osascript -e 'tell application \"System Events\" to (name of processes) contains \"Brave\"'"
#  if test "$(eval "$Brave")" = "true"; then
#  osascript <<EOF
#set titleString to ""
#
#tell application "Brave"
#set window_list to every window # get the windows
#repeat with the_window in window_list # for every window
#    set tab_list to every tab in the_window # get the tabs
#    repeat with the_tab in tab_list # for every tab
#        set the_url to the URL of the_tab # grab the URL
#        set titleString to titleString & the_url & "\n"
#    end repeat
#end repeat
#end tell
#EOF
#fi | grep https://esome.remeet.com/meet/ >/dev/null
#}

## check if you are in a meeting Vivaldi Browser
#function inARemeetMeeting() {
#  Vivaldi="osascript -e 'tell application \"System Events\" to (name of processes) contains \"Vivaldi\"'"
#  if test "$(eval "$Vivaldi")" = "true"; then
#  osascript <<EOF
#set titleString to ""
#
#tell application "Vivaldi"
#set window_list to every window # get the windows
#repeat with the_window in window_list # for every window
#    set tab_list to every tab in the_window # get the tabs
#    repeat with the_tab in tab_list # for every tab
#        set the_url to the URL of the_tab # grab the URL
#        set titleString to titleString & the_url & "\n"
#    end repeat
#end repeat
#end tell
#EOF
#fi | grep https://esome.remeet.com/meet/ >/dev/null
#}

## check if you are in a meeting Firefox
#function inARemeetMeeting() {
#  Firefox="osascript -e 'tell application \"System Events\" to (name of processes) contains \"Firefox\"'"
#  if test "$(eval "$Firefox")" = "true"; then
#  osascript <<EOF
#set titleString to ""
#
#tell application "Firefox"
#set window_list to every window # get the windows
#repeat with the_window in window_list # for every window
#    set tab_list to every tab in the_window # get the tabs
#    repeat with the_tab in tab_list # for every tab
#        set the_url to the URL of the_tab # grab the URL
#        set titleString to titleString & the_url & "\n"
#    end repeat
#end repeat
#end tell
#EOF
#fi | grep https://esome.remeet.com/meet/ >/dev/null
#}

# change your status when in zoom-call and activate DND-mode
function setStatusInRemeetMeeting() {
  ( inARemeetMeeting && [[ $FINAL_STATUS == "inAReemetCall" ]] ) &&
    LightOn &&
    AirPurifierOFF &&
    activateDND
  ( inARemeetMeeting && [[ $FINAL_STATUS != "inAReemetCall" ]] && isStatusClean ) &&
    export FINAL_STATUS="inAReemetCall" &&
    LightOn &&
    AirPurifierOFF &&
    activateDND &&
    echo "Trying to set your Slack-status to show you started a Remeet-Call" &&
    PAYLOAD="{ \"profile\": { \"status_text\": \"$REMEET_MESSAGE\", \"status_emoji\": \"$REMEET_EMOJI\", \"status_expiration\": 0 } }" &&
    echo "Setting your Slack-status to show you started a Remeet-Call" &&
    setProfile "$PAYLOAD"
  ( ! inARemeetMeeting  && [[ $FINAL_STATUS == "inAReemetCall" ]] ) &&
    reset
}