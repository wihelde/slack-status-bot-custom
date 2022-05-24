# AirPurifier
function AirPurifierON() {
  shortcuts run "Luftreiniger ein"
}

function AirPurifierOFF() {
  shortcuts run "Luftreiniger aus" >/dev/null
}

# Elgato lights
function LightOn() {
  JSON=$(curl -s GET -H "Content-Type: application/json; charset=UTF-8" -s "http://192.0.2.31:9123/elgato/lights")
  LIGHTSTATUS=$(echo "$JSON" | jq -r '.lights[].on | tostring')
  [[ $LIGHTSTATUS == "0" ]] &&
    curl -s --location --request PUT 'http://192.0.2.31:9123/elgato/lights' \
      --header 'Content-Type: application/json' \
      --data-raw '{"lights":[{"brightness":20,"temperature":213,"on":1}],"numberOfLights":1}' >/dev/null &&
  curl -s --location --request PUT 'http://192.0.2.32:9123/elgato/lights' \
    --header 'Content-Type: application/json' \
    --data-raw '{"lights":[{"brightness":20,"temperature":213,"on":1}],"numberOfLights":1}' >/dev/null
  return 0
 }

function LightOff() {
  JSON=$(curl -s GET -H "Content-Type: application/json; charset=UTF-8" -s "http://192.0.2.31:9123/elgato/lights")
  LIGHTSTATUS=$(echo "$JSON" | jq -r '.lights[].on | tostring')
  [[ $LIGHTSTATUS == "1" ]] &&
    curl -s --location --request PUT 'http://192.0.2.31:9123/elgato/lights' \
      --header 'Content-Type: application/json' \
      --data-raw '{"lights":[{"on":0}],"numberOfLights":1}'  >/dev/null &&
    curl -s --location --request PUT 'http://192.0.2.32:9123/elgato/lights' \
      --header 'Content-Type: application/json' \
      --data-raw '{"lights":[{"on":0}],"numberOfLights":1}' >/dev/null
  return 0
 }