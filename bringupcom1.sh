#!/bin/bash
  while true
    do 
      socat pty,link=/dev/ttyUSB1,raw,user=0,group=0,mode=777 tcp:192.168.47.168:3334
      sleep 60
    done

