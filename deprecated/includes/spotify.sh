source ./includes/functions/spotify.sh

# kills all background processes when this script is killed
trap 'kill -9 $(jobs -p)' EXIT

while true
 do
  setStatusSpotify
  sleep 1
done