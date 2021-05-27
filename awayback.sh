#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# User-Config
SLACK_INSTANCE=esome

source ./includes/misc.sh
source ./includes/custom_status_messages.sh
source ./includes/DND.sh
source ./includes/custom-status.sh

changeStatus && setProfile && exit 0