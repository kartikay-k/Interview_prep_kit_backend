/**
 * Test script to try different Gemini models
 */
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;

const MODELS_TO_TEST = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
  'gemini-pro-vision',
];

const testBody = {
  contents: [{
    role: 'user',
    parts: [{ text: 'Reply with just: Working' }]
  }],
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 50
  }
};

async function testModel(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  
  try {
    const response = await axios.post(url, testBody, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { success: true, text: text?.trim() };
  } catch (error) {
    return { 
      success: false, 
      status: error.response?.status,
      error: error.response?.data?.error?.message || error.message 
    };
  }
}

async function findWorkingModel() {
  console.log('🔍 Testing different Gemini models with your API key...\n');
  console.log(`API Key: ${API_KEY.substring(0, 10)}... (${API_KEY.length} chars)\n`);
  
  let workingModel = null;
  
  for (const model of MODELS_TO_TEST) {
    process.stdout.write(`Testing ${model}... `);
    
    const result = await testModel(model);
    
    if (result.success) {
      console.log(`✅ WORKS! Response: "${result.text}"`);
      workingModel = model;
      break;
    } else {
      console.log(`❌ Failed: ${result.error?.substring(0, 60)}...`);
    }
  }
  
  if (workingModel) {
    console.log(`\n✨ Found working model: ${workingModel}`);
    return workingModel;
  } else {
    console.log('\n❌ No working models found.');
    console.log('\n💡 This means your API key is likely invalid.');
    console.log('Please get a valid key from: https://aistudio.google.com/app/apikey');
    return null;
  }
}

findWorkingModel().then(model => {
  if (model) {
    console.log(`\n📝 Update your .env file:`);
    console.log(`GEMINI_MODEL=${model}`);
    process.exit(0);
  } else {
    process.exit(1);
  }
});
