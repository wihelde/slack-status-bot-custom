# do magic
log_cleanup \
&& echo "logs are cleaned up"
( ! isSpotifyPlaying && ! isAppleMusicPlaying && ! inAMeeting && ! statusReset && ! DNDstatusReset) \
&& echo "Neither Spotify nor Apple Music plays a song." \
&& echo "No Zoom call is running." \
&& echo "DND-mode is already deactivated." \
&& echo "Status was cleared already before." \
&& echo "No action taken." && exit 0
! isStatusClean \
&& echo "Status was set by user." \
&& echo "No change will take effect." && exit 0
echo "Check if in a zoom-call ..."
inAMeeting && setStatusInMeeting && exit 0
echo "Not in a zoom-call"
DeactivateDND
echo "Check if Spotify is playing ..."
isSpotifyPlaying && setStatusSpotify && exit 0
echo "No Spotify running"
echo "Check if Apple Music is playing ..."
isAppleMusicPlaying && setStatusAppleMusic && exit 0
echo "No Apple Music is running"
reset
echo "Done"
exit 0
