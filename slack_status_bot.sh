#!/bin/bash

########################
### User-Config-Part ###
########################

# Do you want to share your Spotify-Status? Please use "yes" or "no"
ENABLE_SPOTIFY="yes"

# Do you want to share your Apple Music-Status? Please use "yes" or "no"
ENABLE_APPLE_MUSIC="yes"

# Do you want to share your Zoom-Status? Please use "yes" or "no"
ENABLE_ZOOM="yes"

# Do you want to share your Microsoft Teams-Status? Please use "yes" or "no"
ENABLE_MICROSOFT_TEAMS="yes"

# Do you want to share your Microsoft Teams-Status? Please use "yes" or "no"
ENABLE_SLACK_HUDDLE="yes"

# Do you want to enable and disable your Mac OS Focus-mode during calls?
export ENABLE_FOCUS_SWITCH="yes"

#####################
### Do not touch! ###
#####################

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# kills all background processes when this script is killed
trap 'kill -9 $(jobs -p)' EXIT

source ./includes/status_correction.sh &
[[ "$ENABLE_SPOTIFY" == "yes" ]] && source ./includes/spotify.sh &
[[ "$ENABLE_MICROSOFT_TEAMS" == "yes" ]] && source ./includes/microsoft_teams.sh &
[[ "$ENABLE_APPLE_MUSIC" == "yes" ]] && source ./includes/apple_music.sh &
[[ "$ENABLE_ZOOM" == "yes" ]] && source ./includes/zoom.sh &
[[ "$ENABLE_SLACK_HUDDLE" == "yes" ]] && source ./includes/huddle.sh
