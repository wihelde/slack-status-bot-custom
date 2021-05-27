#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# set PATH for jq as variable to be used in launchd
jq=/usr/local/bin/jq

source ./includes/misc.sh
source ./includes/custom_status_messages.sh
source ./includes/apple_music.sh
source ./includes/spotify.sh
source ./includes/zoom.sh
source ./includes/DND.sh
source ./includes/slack.sh
source ./includes/log_cleanup.sh
source ./includes/bot.sh