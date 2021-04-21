#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# User-Config
SLACK_INSTANCE=bloggerbutze

# include useful functions
source ./includes/misc.sh
source ./includes/custom_status_messages.sh
source ./includes/DND.sh
source ./includes/manual_message_bot.sh

# magic
changeStatus && setProfile && exit 0
