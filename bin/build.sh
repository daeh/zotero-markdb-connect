#!/bin/sh

version='0.0.16'

rm -f zotero-obsidian-citations-${version}.xpi
zip -r zotero-obsidian-citations-${version}.xpi chrome/* defaults/* chrome.manifest install.rdf

# To release a new version:
# - increase version number in all files (not just here)
# - run this script to create a new .xpi file
# - commit and push to Github
# - make a release on Github, and manually upload the new .xpi file
