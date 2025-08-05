const { RtcTokenBuilder, RtcRole } = require("agora-token");

// Use environment variables or fallback to placeholder values
// NOTE: You need to set AGORA_APP_CERTIFICATE in your environment variables
// Get this from your Agora Console: https://console.agora.io/
const appId = process.env.AGORA_APP_ID || 'c6b06b53084241529f38d82e54ea8da7';
const appCertificate = process.env.AGORA_APP_CERTIFICATE || 'YOUR_AGORA_APP_CERTIFICATE_HERE';

exports.generateToken = (req, res) => {
  console.log('🔑 Agora token generation requested');
  console.log('📋 Request params:', req.query);
  console.log('🔧 Environment check - AGORA_APP_ID:', !!process.env.AGORA_APP_ID, 'AGORA_APP_CERTIFICATE:', !!process.env.AGORA_APP_CERTIFICATE);
  console.log('🔧 Using appId:', appId.substring(0, 10) + '...');
  
  const channelName = req.query.channelName;
  const uid = req.query.uid;
  const role = req.query.role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const tokenExpirationInSecond = 3600;
  const privilegeExpirationInSecond = 3600;

  if (!appCertificate || appCertificate === 'YOUR_AGORA_APP_CERTIFICATE_HERE') {
    console.error('❌ Missing Agora App Certificate');
    return res.status(500).json({ 
      error: "Agora App Certificate not configured. Please set AGORA_APP_CERTIFICATE environment variable.",
      details: "Get your App Certificate from https://console.agora.io/"
    });
  }

  if (!channelName || !uid) {
    console.error('❌ Missing required parameters');
    return res.status(400).json({ error: "channelName and uid are required" });
  }

  try {
    console.log('🏗️ Building token with params:', {
      appId: appId.substring(0, 10) + '...',
      channelName,
      uid: parseInt(uid, 10),
      role: req.query.role
    });
    
    const token = RtcTokenBuilder.buildTokenWithUid( 
      appId,
      appCertificate,
      channelName,
      parseInt(uid, 10),
      role,
      tokenExpirationInSecond,
      privilegeExpirationInSecond
    );

    console.log('✅ Token generated successfully');
    return res.json({ token });
  } catch (error) {
    console.error('❌ Error generating token:', error);
    return res.status(500).json({ 
      error: "Failed to generate token",
      details: error.message 
    });
  }
}; 