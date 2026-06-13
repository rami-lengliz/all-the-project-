const axios = require('axios');

async function testWallet() {
  const API_URL = 'http://localhost:3001/api';

  try {
    console.log('Logging in as renter (user6@example.com)...');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'user6@example.com',
      password: 'password123',
    });
    
    const token = loginRes.data.data.accessToken || loginRes.data.data.access_token;
    if (!token) console.error("No token found in response!", loginRes.data);
    console.log('Login successful. Token acquired.');

    const config = {
      headers: { Authorization: `Bearer ${token}` }
    };

    console.log('\n--- 1. Fetching Wallet Details ---');
    const getWalletRes = await axios.get(`${API_URL}/wallet/me`, config);
    console.log(JSON.stringify(getWalletRes.data, null, 2));

    console.log('\n--- 2. Topping Up Wallet ---');
    const topUpAmount = 50.5;
    console.log(`Topping up with ${topUpAmount} TND...`);
    const topUpRes = await axios.post(`${API_URL}/wallet/topup`, { amount: topUpAmount }, config);
    console.log(JSON.stringify(topUpRes.data, null, 2));

    console.log('\n--- 3. Fetching Wallet Details Again ---');
    const getWalletAgainRes = await axios.get(`${API_URL}/wallet/me`, config);
    console.log(JSON.stringify(getWalletAgainRes.data, null, 2));

  } catch (error) {
    if (error.response) {
      console.error('Error Response:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testWallet();
