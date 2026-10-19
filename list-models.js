/**
 * List available models for the API key
 */
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
  console.log('🔍 Fetching available models for your API key...\n');
  console.log(`Key: ${API_KEY.substring(0, 10)}...\n`);
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
  
  try {
    const response = await axios.get(url, { timeout: 15000 });
    const models = response.data.models || [];
    
    console.log(`✅ Found ${models.length} available models:\n`);
    
    const supportedModels = models.filter(m => 
      m.supportedGenerationMethods?.includes('generateContent')
    );
    
    console.log('Models that support generateContent:');
    console.log('=' .repeat(60));
    
    supportedModels.forEach(model => {
      const name = model.name.replace('models/', '');
      console.log(`\n📦 ${name}`);
      console.log(`   Display Name: ${model.displayName ||'N/A'}`);
      console.log(`   Description: ${model.description?.substring(0, 80) || 'N/A'}...`);
      console.log(`   Supported: ${model.supportedGenerationMethods?.join(', ')}`);
    });
    
    if (supportedModels.length > 0) {
      const recommended = supportedModels[0].name.replace('models/', '');
      console.log('\n' + '='.repeat(60));
      console.log(`\n✨ RECOMMENDED MODEL: ${recommended}`);
      console.log(`\nUpdate your .env file:`);
      console.log(`GEMINI_MODEL=${recommended}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to list models\n');
    
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
      
      if (error.response.status === 403 || error.response.status === 401) {
        console.log('\n💡 Your API key may not have permission to list models.');
        console.log('   But it might still work for generateContent.');
        console.log('   Try these common model names:');
        console.log('   - gemini-1.5-flash');
        console.log('   - gemini-1.5-pro');
        console.log('   - gemini-pro');
      }
    } else {
      console.log(`Error: ${error.message}`);
    }
  }
}

listModels();
