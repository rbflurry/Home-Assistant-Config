#!/bin/bash
#zwave
  while true
    do 
      socat pty,link=/dev/ttyUSB0,raw,user=0,group=0,mode=777 tcp:192.168.47.206:3333
      sleep 60
    done

exit