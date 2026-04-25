require('dotenv').config();
const OpenAI = require('openai');
const client = new OpenAI({ 
  apiKey: process.env.GROQ_API_KEY, 
  baseURL: 'https://api.groq.com/openai/v1' 
});
client.chat.completions.create({
  model: 'llama-3.3-70b-versatile',
  messages: [{ role: 'user', content: 'Say hello world' }],
}).then(res => console.log('SUCCESS:', res.choices[0].message.content)).catch(err => console.error('ERROR:', err.message));
