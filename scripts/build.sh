#!/bin/sh

version='0.0.27'

rm -f markdb-connect-${version}.xpi
zip -r markdb-connect-${version}.xpi chrome/* defaults/* chrome.manifest install.rdf -x "*.DS_Store"

# To release a new version:
# - increase version number in all files (not just here)
# - run this script to create a new .xpi file
# - commit and push to Github
# - make a release on Github, and manually upload the new .xpi file
