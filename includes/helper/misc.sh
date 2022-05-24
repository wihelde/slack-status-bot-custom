# set PATH for jq as variable to be used in launchd
jq=/opt/homebrew/bin/jq

# get current day of week
export DOW=$(date +%u)
export date=$(date +"%Y-%m-%d %T")

# define your local tracking-files
STATUS_CHECK_FILE=status_check.txt

# define save-location for log-files
[[ ! -d ./logs/ ]] && echo "log-folder not existing - I create it for you" &&
  mkdir "logs"
[[ ! -f ./logs/$STATUS_CHECK_FILE ]] && echo "no status-check-log-file existing - I create it for you" &&
  touch ./logs/$STATUS_CHECK_FILE && echo "reset" >.$STATUS_CHECK_FILE && mv .$STATUS_CHECK_FILE ./logs/$STATUS_CHECK_FILE

# define token
[[ ! -f .token ]] && echo "There was no token-file found. Please create a file called .token and include your slack-token(s)!" && exit 1
LEGACY_TOKEN_ARRAY=($(grep -v '^#' .token))