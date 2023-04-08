#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

source ./includes/helper/misc.sh
source ./includes/helper/custom_status_messages.sh
source ./includes/functions/DND.sh
source ./includes/custom-status.sh

changeStatus && setProfile && exit 0