source ./includes/functions/status_correction.sh

# kills all background processes when this script is killed
trap 'kill -9 $(jobs -p)' EXIT

while true; do
  correctStatus
  sleep 60
done;