#!/bin/bash

######################################
## This script pulls my selected    ##
## files from my Github repo, and   ##
## treats them as the 'master' copy ##
######################################

cd /root/.homeassistant/
git checkout master
git branch -D upload
git fetch origin master
git reset --hard origin/master
service hass-daemon restart
