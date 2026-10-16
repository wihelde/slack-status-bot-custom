source ./includes/functions/huddle.sh

# kills all background processes when this script is killed
trap 'kill -9 $(jobs -p)' EXIT

while true; do
  setStatusInAHuddle
  sleep 1
done;
