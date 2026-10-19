/**
 * Test script to verify Gemini API connectivity
 * Run with: node test-api.js
 */
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function testAPI() {
  console.log('🔍 Testing Gemini API Connection...\n');
  
  // Check if API key exists
  if (!API_KEY) {
    console.error('❌ ERROR: GEMINI_API_KEY not found in .env file');
    console.log('\n📝 To fix this:');
    console.log('1. Go to https://aistudio.google.com/app/apikey');
    console.log('2. Click "Create API Key"');
    console.log('3. Copy the API key (starts with "AIza...")');
    console.log('4. Update GEMINI_API_KEY in backend/.env');
    process.exit(1);
  }

  console.log('✓ API Key found');
  console.log(`  Model: ${MODEL}`);
  console.log(`  Key prefix: ${API_KEY.substring(0, 8)}...`);
  console.log(`  Key length: ${API_KEY.length} characters`);
  
  // Validate API key format
  if (!API_KEY.startsWith('AIza') || API_KEY.length < 30) {
    console.warn('\n⚠️  WARNING: API key format looks incorrect');
    console.log('   Expected: Starts with "AIza" and ~39 characters long');
    console.log('   Your key: Starts with "' + API_KEY.substring(0, 4) + '" and ' + API_KEY.length + ' characters long');
    console.log('\n📝 Get a valid API key from: https://aistudio.google.com/app/apikey\n');
  }

  // Test API call
  console.log('\n🚀 Making test API call...');
  
  const testBody = {
    contents: [{
      role: 'user',
      parts: [{ text: 'Say "Hello, API is working!" and nothing else.' }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 100
    }
  };

  try {
    const response = await axios.post(
      `${BASE_URL}?key=${API_KEY}`,
      testBody,
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text) {
      console.log('✅ SUCCESS! API is working correctly');
      console.log(`   Response: "${text.trim()}"`);
      console.log('\n✨ Your Gemini API is configured correctly!');
      console.log('   You can now create interview prep kits.\n');
    } else {
      console.log('⚠️  Unexpected response format:', JSON.stringify(response.data, null, 2));
    }

  } catch (error) {
    console.error('❌ API CALL FAILED\n');
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      console.log(`   HTTP Status: ${status}`);
      console.log(`   Error: ${JSON.stringify(data, null, 2)}`);
      
      if (status === 400) {
        console.log('\n💡 This usually means:');
        console.log('   • Invalid API key format');
        console.log('   • API key has incorrect characters');
        console.log('   • Model name is wrong');
      } else if (status === 403 || status === 401) {
        console.log('\n💡 This usually means:');
        console.log('   • API key is invalid or expired');
        console.log('   • API key doesn\'t have permission for this model');
        console.log('   • Gemini API is not enabled for your project');
      } else if (status === 404) {
        console.log('\n💡 This usually means:');
        console.log('   • Model name is incorrect');
        console.log('   • API endpoint URL is wrong');
        console.log(`   • Current model: ${MODEL}`);
        console.log('   • Try: gemini-1.5-flash or gemini-1.5-pro');
      } else if (status === 429) {
        console.log('\n💡 Rate limit exceeded');
        console.log('   • Too many requests');
        console.log('   • Wait a moment and try again');
      }
      
    } else if (error.request) {
      console.log('   Network error - no response received');
      console.log('   Check your internet connection');
    } else {
      console.log('   Error:', error.message);
    }
    
    console.log('\n📝 To fix this:');
    console.log('1. Get a valid API key: https://aistudio.google.com/app/apikey');
    console.log('2. Make sure you\'re signed in with a Google account');
    console.log('3. Click "Create API Key" in new project or existing project');
    console.log('4. Copy the key (starts with "AIza")');
    console.log('5. Update backend/.env:');
    console.log('   GEMINI_API_KEY=AIzaYourActualKeyHere');
    console.log('6. Restart the backend server');
    console.log('7. Run this test again: node test-api.js\n');
    
    process.exit(1);
  }
}

testAPI();
