require('dotenv').config();
fetch('https://api.groq.com/openai/v1/models', {
  headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY }
})
.then(res => res.json())
.then(data => console.log('MODELS:', data.data.map(m => m.id)))
.catch(err => console.error(err));
