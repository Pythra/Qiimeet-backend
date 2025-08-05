#!/bin/bash
# Build script for Render deployment

echo "Starting build process..."

# Install dependencies
npm install

# Rebuild native modules for the target platform
echo "Rebuilding native modules..."
npm rebuild bcrypt --platform=linux --arch=x64
npm rebuild sharp --platform=linux --arch=x64

echo "Build completed successfully!" 