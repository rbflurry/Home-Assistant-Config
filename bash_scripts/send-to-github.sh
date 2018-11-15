#!/bin/bash

####################################
## This script pushes my selected ##
## files to my github repo on a   ##
## new branch called 'upload'     ##
####################################

cd /root/.homeassistant
git add .
git checkout -b dev
git commit -m "$1"
git push origin dev
exit
