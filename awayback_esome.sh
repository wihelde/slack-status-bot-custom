#!/bin/bash

# define your working-directory
cd "$(dirname "$0")" >/dev/null 2>&1 || exit 1

# define your token
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
#DEFAULT=:heads-down:
FOCUS=:get-shit-done:
MEETING=:spiral_calendar_pad:
MONDAY=:monday:
TGIF=:tgif:
SPORT=:rowboat:
SHOPPING=:shopping_trolley:
TEAMS=:teams:
SKYPE=:skype:
DOG=:dog2:

# random offline message
OFFLINE_MESSAGE_LIST=( \
    "Does this away message really mean I'm away, or am I pretending to be away?" \
    "Don't Worry!, I dont know where I am either." \
    "Sorry, I'm not here right now, but feel free to talk to the computer as long as you like." \
    "Roses are red - Violets are blue - Some away messages rhyme, and some don't." \
    "Keep staring at the screen and maybe I'll come back." \
    "I'm not here right now but if you scream really loud into your monitor I might be able to hear you!" \
)
OFFLINE_MESSAGE=${OFFLINE_MESSAGE_LIST[ $((RANDOM % ${#OFFLINE_MESSAGE_LIST[@]}))]}

# random online-message
ON_MESSAGE=( \
  "Sheep plan for the future. Lions plan far beyond." \
  "Life is like a film. It can be very good, but also very bad." \
  "Never make the wrong decision when you should be making the right one." \
  "Your failure will be less painful later if you stop trying now." \
  "An eagle always finds a bridge, no matter how raging the river is." \
  "Insider tip: Fresh air. Use it, because it is like oxygen for the body." \
  "If you don't succeed, 99% of the time it's because of yourself or something else." \
  "There are two types of mistakes you can make in life. Avoid both." \
  "Most people are like ducks. They have hardly any capital investments." \
  "If it feels like the whole universe is against you, stay calm. It will have its reasons." \
  "The best thoughts originate in the head." \
  "Money is like an atomic bomb. Better to have than to need." \
  "Holiday ban is climate protection!" \
  "Fire does not ask. Fire does." \
  )

# related emoji for random online-message
ON_EMOJI=( \
  ":lion_face:" \
  ":clapper:" \
  ":bulb:" \
  ":heads_down:" \
  ":eagle:" \
  ":lungs:" \
  ":eyes:" \
  ":robot_face:" \
  ":duck:" \
  ":milky_way:" \
  ":exploding_head:" \
  ":bomb:" \
  ":deciduous_tree:" \
  ":fire:" \
)

# get random number to pick random online message and related emoji
ORDER=$(( ( RANDOM % 13 )  + 0 ))
ON_MESSAGE_FINAL=${ON_MESSAGE[$ORDER]}
ON_EMOJI_FINAL=${ON_EMOJI[$ORDER]}

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
      PAYLOAD="{ \"profile\": { \"status_text\" : \"$ON_MESSAGE_FINAL\", \"status_emoji\" : \"$ON_EMOJI_FINAL\", \"status_expiration\": 0 } }"
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

if [[ $STATUS == "dnd" ]]; then
    STATE=auto
    CURL_URL='https://slack.com/api/dnd.setSnooze?token='$TOKEN'&num_minutes=1440'
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Focus-mode - please disturb only in urgent cases\", \"status_emoji\" : \"$FOCUS\", \"status_expiration\": 0 } }"
    curl -s "$CURL_URL"
    echo "changed" > .awayback_esome_slack_DND
fi

if [[ $STATUS == "sport" ]]; then
    STATE=auto
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Doing some sport, because I'm fat (limited reachability)\", \"status_emoji\" : \"$SPORT\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "shopping" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"Spending money which I don't have for stuff which I don't need\", \"status_emoji\" : \"$SHOPPING\", \"status_expiration\": 0 } }"
fi

if [[ $STATUS == "skype" ]]; then
    STATE=auto
    CURL_URL='https://slack.com/api/dnd.setSnooze?token='$TOKEN'&num_minutes=1440'
    PAYLOAD="{ \"profile\": { \"status_text\" : \"in a meeting - most likely Coke-related\", \"status_emoji\" : \"$SKYPE\", \"status_expiration\": 0 } }"
    curl -s "$CURL_URL" >/dev/null
    echo "changed" > .awayback_esome_slack_DND
fi

if [[ $STATUS == "teams" ]]; then
    STATE=auto
    CURL_URL='https://slack.com/api/dnd.setSnooze?token='$TOKEN'&num_minutes=1440'
    PAYLOAD="{ \"profile\": { \"status_text\" : \"in a meeting - most likely Coke-related\", \"status_emoji\" : \"$TEAMS\", \"status_expiration\": 0 } }"
    curl -s "$CURL_URL"
    echo "changed" > .awayback_esome_slack_DND
fi

if [[ $STATUS == "dog" ]]; then
    STATE=away
    PAYLOAD="{ \"profile\": { \"status_text\" : \"The dog takes me for a walk\", \"status_emoji\" : \"$DOG\", \"status_expiration\": 0 } }"
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
