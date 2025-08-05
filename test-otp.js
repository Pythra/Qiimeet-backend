const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:3000/api';

async function testOTP() {
  const testPhoneNumber = '8012345678'; // Test Nigerian number
  
  console.log('Testing OTP functionality...');
  
  try {
    // Test sending OTP
    console.log('1. Testing send OTP...');
    const sendResponse = await fetch(`${API_BASE_URL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: testPhoneNumber }),
    });
    
    const sendData = await sendResponse.json();
    console.log('Send OTP response:', sendData);
    
    if (sendData.success && sendData.pinId) {
      console.log('✅ OTP sent successfully!');
      console.log('Pin ID:', sendData.pinId);
      
      // Test verification (this will fail with a random code, but we can test the endpoint)
      console.log('\n2. Testing verify OTP...');
      const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pinId: sendData.pinId, 
          pin: '123456', // This will fail, but we can test the endpoint
          phoneNumber: testPhoneNumber 
        }),
      });
      
      const verifyData = await verifyResponse.json();
      console.log('Verify OTP response:', verifyData);
      
      if (verifyData.error) {
        console.log('✅ Verify endpoint working (expected error for wrong code)');
      }
    } else {
      console.log('❌ Failed to send OTP:', sendData.error);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testOTP(); 