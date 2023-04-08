source ./includes/functions/apple_music.sh

# kills all background processes when this script is killed
trap 'kill -9 $(jobs -p)' EXIT

while true; do
setStatusAppleMusic
sleep 1
done;