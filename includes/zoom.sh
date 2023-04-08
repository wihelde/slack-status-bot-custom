source ./includes/functions/zoom.sh

# kills all background processes when this script is killed
trap 'kill -9 $(jobs -p)' EXIT

while true; do
  setStatusInMeeting
  sleep 1
done;