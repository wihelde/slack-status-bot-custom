source ./includes/functions/dont_be_absent.sh

# kills all background processes when this script is killed
trap 'kill -9 $(jobs -p)' EXIT

while true; do
  correctPresenceStatus
  sleep 540
done;
