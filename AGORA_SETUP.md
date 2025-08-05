# Agora Setup Guide

## Required Environment Variables

To use the Agora voice/video calling feature, you need to set the following environment variables:

### For Local Development
Create a `.env` file in the backend directory with:

```
AGORA_APP_ID=your_agora_app_id_here
AGORA_APP_CERTIFICATE=your_agora_app_certificate_here
```

### For AWS Elastic Beanstalk
Set these environment variables in your AWS Elastic Beanstalk environment configuration.

## How to Get Agora Credentials

1. Go to [Agora Console](https://console.agora.io/)
2. Create a new project or select an existing one
3. Go to the "Project Management" section
4. Copy your **App ID** and **App Certificate**

## Current Status

The app is currently using a hardcoded App ID: `c6b06b53084241529f38d82e54ea8da7`

You need to:
1. Get your actual Agora App Certificate from the Agora Console
2. Set the `AGORA_APP_CERTIFICATE` environment variable
3. Optionally, set `AGORA_APP_ID` if you want to use a different App ID

## Testing

Once configured, the token generation endpoint will be available at:
`GET /api/agora/token?channelName=test&uid=0&role=publisher` 