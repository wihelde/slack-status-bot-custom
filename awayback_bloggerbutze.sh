#!/bin/bash

cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# CONFIG_FILE="$HOME/dev/slack_status_updater/.slack_status_bloggerbutze.conf"
TOKEN=$(awk 'NR==5' .token)

# Colors
red=$(tput setaf 1)
green=$(tput setaf 2)
reset=$(tput sgr0)

# Emojis
SICK=:face_with_thermometer:
OFF=:mobile_phone_off:
BREAK=:double_vertical_bar:
HOLIDAY=:palm_tree:
DEFAULT=:heads-down:


STATUS="$1"

if [[ $STATUS == "on" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"working hard on something\", \"status_emoji\" : \"$DEFAULT\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "off" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"\", \"status_emoji\" : \"$OFF\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "sick-on" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Out sick\", \"status_emoji\" : \"$SICK\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "sick-off" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Out sick\", \"status_emoji\" : \"$SICK\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "break-on" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Having a break. Having no KitKat.\", \"status_emoji\" : \"$BREAK\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "break-off" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Having a break. Having no KitKat.\", \"status_emoji\" : \"$BREAK\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "holiday-on" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"strong vacationing\", \"status_emoji\" : \"$HOLIDAY\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "holiday-off" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"strong vacationing\", \"status_emoji\" : \"$HOLIDAY\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "meeting" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"working hard on something\", \"status_emoji\" : \"$DEFAULT\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "ar" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"working hard on something\", \"status_emoji\" : \"$DEFAULT\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "dnd" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"working hard on something\", \"status_emoji\" : \"$DEFAULT\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "coffee" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"working hard on something\", \"status_emoji\" : \"$DEFAULT\", \"status_expiration\": 0 } }"
fi

function setProfile() {
  curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json; charset=UTF-8" -s -d "$PAYLOAD" "https://slack.com/api/users.profile.set" >/dev/null
}

function changeStatus() {
curl -s --data token="$TOKEN" \
    --data presence="$STATE" \
    https://slack.com/api/users.setPresence | \
    grep -Eq '"ok": ?true' && \
        echo "${green}Away status updated ok${reset}" || \
        echo "${red}There was a problem updating the away status${reset}"
}

changeStatus && setProfile && exit 0
