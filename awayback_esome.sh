#!/bin/bash

cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# CONFIG_FILE="$HOME/dev/slack_status_updater/.slack_status_bloggerbutze.conf"
TOKEN=$(awk 'NR==2' .token)

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
FOCUS=:get-shit-done:
MEETING=:spiral_calendar_pad:
MONDAY=:monday:
TGIF=:tgif:
ANNUAL_REVIEW=:gossip:
NO_COFFEE=:no-coffee:
OFFLINE_MESSAGE_LIST=( \
    "I bet you were expecting an away message" \
    "Does this away message really mean I'm away, or am I pretending to be away?" \
    "Only stalkers look at other people's away messages." \
    "Don't Worry!, I dont know where I am either." \
    "Sorry, I'm not here right now, but feel free to talk to the computer as long as you like." \
    "I have a secret to tell you... I'm away from my computer right now." \
    "Roses are red - Violets are blue - Some away messages rhyme, and some don't." \
    "I'll be back in 5 minutes but if I'm not, just read this away message again." \
    "Keep staring at the screen and maybe I'll come back." \
    "I'm not here right now but if you scream really loud into your monitor I might be able to hear you!" \
)
OFFLINE_MESSAGE=${OFFLINE_MESSAGE_LIST[ $((RANDOM % ${#OFFLINE_MESSAGE_LIST[@]}))]}

STATUS="$1"

if [[ $STATUS == "on" ]]; then
    STATE=auto
    DOW=$(date +%u)
    DND_STATE=$(cat .awayback_esome_slack_DND)
    CURL_URL='https://slack.com/api/dnd.endDnd?token='$TOKEN
    if [[ $DOW == "1" ]]; then
      PAYLOAD="{ \"profile\": { \"status_text\" : \"Pretty sure I smell a Monday here ...\", \"status_emoji\" : \"$MONDAY\", \"status_expiration\": 0 } }"
      echo "Its monday - will use another emoji for today"
    elif [[ $DOW == "5" ]]; then
      PAYLOAD="{ \"profile\": { \"status_text\" : \"TGIF!\", \"status_emoji\" : \"$TGIF\", \"status_expiration\": 0 } }"
      echo "Its friday - will use another emoji for today"
    else
      PAYLOAD="{ \"profile\": { \"status_text\" : \"working hard on something\", \"status_emoji\" : \"$DEFAULT\", \"status_expiration\": 0 } }"
    fi
    if [[ "$DND_STATE" == "changed" ]]; then
      curl -s "$CURL_URL"
    fi
    echo "reset" > .awayback_esome_slack_DND
fi

if [[ $STATUS == "off" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"$OFFLINE_MESSAGE\", \"status_emoji\" : \"$OFF\", \"status_expiration\": 0 } }"
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
    PAYLOAD="{ \"profile\": { \"status_text\" : \"in some non-zoom-meeting\", \"status_emoji\" : \"$MEETING\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "ar" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Annual Review ongoing\", \"status_emoji\" : \"$ANNUAL_REVIEW\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "dnd" ]]; then
    STATE=auto
    CURL_URL='https://slack.com/api/dnd.setSnooze?token='$TOKEN'&num_minutes=1440'
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Focus-mode - please disturb only in urgent cases\", \"status_emoji\" : \"$FOCUS\", \"status_expiration\": 0 } }"
    curl -s "$CURL_URL"
    echo "changed" > .awayback_esome_slack_DND
fi

if [[ $STATUS == "coffee" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"No coffee - no talk\", \"status_emoji\" : \"$NO_COFFEE\", \"status_expiration\": 0 } }"
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
