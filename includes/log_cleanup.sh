function log_cleanup() {
  echo "$(tail -1000 ./logs/log.txt)" >./logs/log.txt
}