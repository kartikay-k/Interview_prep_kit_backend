/**
 * Test different API versions
 */
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;

const TESTS = [
  { version: 'v1beta', model: 'gemini-1.5-flash' },
  { version: 'v1', model: 'gemini-1.5-flash' },
  { version: 'v1beta', model: 'gemini-pro' },
  { version: 'v1', model: 'gemini-pro' },
  { version: 'v1alpha', model: 'gemini-1.5-flash' },
];

async function testAPI(version, model) {
  const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${API_KEY}`;
  
  try {
    const response = await axios.post(url, {
      contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }]
    }, { timeout: 15000 });
    
    return { success: true, text: response.data?.candidates?.[0]?.content?.parts?.[0]?.text };
  } catch (error) {
    return { 
      success: false, 
      status: error.response?.status,
      message: error.response?.data?.error?.message || error.message
    };
  }
}

async function run() {
  console.log('🔍 Testing API versions and models...\n');
  console.log(`Key format: ${API_KEY.substring(0, 10)}... (${API_KEY.length} chars)`);
  console.log(`Key starts with: "${API_KEY.substring(0, 4)}"\n`);
  
  for (const test of TESTS) {
    process.stdout.write(`${test.version}/${test.model}... `);
    const result = await testAPI(test.version, test.model);
    
    if (result.success) {
      console.log(`✅ WORKS!`);
      console.log(`\n🎉 Found working configuration:`);
      console.log(`   API Version: ${test.version}`);
      console.log(`   Model: ${test.model}`);
      return { version: test.version, model: test.model };
    } else {
      console.log(`❌ ${result.status}: ${result.message?.substring(0, 50)}...`);
    }
  }
  
  console.log('\n❌ No working configuration found.');
  console.log('\n🔑 Your API key format suggests it may not be a Google Gemini key.');
  console.log('   Expected format: AIzaSy... (~39 chars)');
  console.log(`   Your key format: ${API_KEY.substring(0, 6)}... (${API_KEY.length} chars)`);
  console.log('\n📝 To get a valid Gemini API key:');
  console.log('   1. Visit: https://aistudio.google.com/app/apikey');
  console.log('   2. Sign in with Google');
  console.log('   3. Click "Create API key"');
  console.log('   4. Copy the key (starts with AIza)');
  
  return null;
}

run();
