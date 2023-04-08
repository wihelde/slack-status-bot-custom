source ./includes/functions/microsoft_teams.sh

# kills all background processes when this script is killed
trap 'kill -9 $(jobs -p)' EXIT

while true; do
setStatusInMicrosoftTeamsMeeting
sleep 1
done;