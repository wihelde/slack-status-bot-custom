# IDK
trap onexit INT

# IDK
function onexit() {
  echo 'Exiting'
  isStatusClean && reset
  exit
}

# get current day of week
export DOW=$(date +%u)

# define your local tracking-files
STATUS_FILE=status.txt
DND_STATUS_FILE=status_DND.txt

# define save-location for log-files
[[ ! -d ./logs/ ]] && echo "log-folder not existing - I create it for you" \
&& mkdir "logs"
[[ ! -f ./logs/$STATUS_FILE ]] && echo "no status-log-file existing - I create it for you" \
&& touch ./logs/$STATUS_FILE && echo "reset" > .$STATUS_FILE && mv .$STATUS_FILE ./logs/$STATUS_FILE
[[ ! -f ./logs/$DND_STATUS_FILE ]] && echo "no DND-status-log-file existing - I create it for you" \
&& touch ./logs/$DND_STATUS_FILE && echo "reset" > .$DND_STATUS_FILE && mv .$DND_STATUS_FILE ./logs/$DND_STATUS_FILE

# define token
[[ ! -f .token ]] && echo "There was no token-file found. Please create a file called .token and include your slack-token(s)!" && exit 1
LEGACY_TOKEN_ARRAY=($(grep -v '^#' .token))
