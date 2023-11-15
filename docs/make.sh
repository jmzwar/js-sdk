#!/bin/bash

# Command script for Sphinx documentation

# Change to the script's directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Sphinx executable
SPHINXBUILD=${SPHINXBUILD:-sphinx-build}
SOURCEDIR=source
BUILDDIR=build

# Check if Sphinx is installed
$SPHINXBUILD > /dev/null 2>&1
if [ $? -eq 9009 ]; then
    echo ""
    echo "The 'sphinx-build' command was not found. Make sure you have Sphinx"
    echo "installed, then set the SPHINXBUILD environment variable to point"
    echo "to the full path of the 'sphinx-build' executable. Alternatively, you"
    echo "may add the Sphinx directory to PATH."
    echo ""
    echo "If you don't have Sphinx installed, grab it from"
    echo "https://www.sphinx-doc.org/"
    exit 1
fi

# Check if no command is provided
if [ -z "$1" ]; then
    exec $SPHINXBUILD -M help "$SOURCEDIR" "$BUILDDIR" $SPHINXOPTS $O
else
    exec $SPHINXBUILD -M $1 "$SOURCEDIR" "$BUILDDIR" $SPHINXOPTS $O
fi
