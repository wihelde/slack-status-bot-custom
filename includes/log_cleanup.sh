function log_cleanup() {
  echo "$(tail -1000 ./logs/log-$SLACK_INSTANCE.txt)" > ./logs/log-$SLACK_INSTANCE.txt
  echo "$(tail -1000 ./logs/error-$SLACK_INSTANCE.txt)" > ./logs/error-$SLACK_INSTANCE.txt
}
