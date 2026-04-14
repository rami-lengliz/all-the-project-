const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args)).catch(() => globalThis.fetch(...args));

async function test() {
    // Login as user1
    const loginRes = await globalThis.fetch('http://localhost:3000/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone: 'user1@test.com', password: 'password123' })
    });
    const loginData = await loginRes.json();
    console.log('Login status:', loginRes.status, 'isHost:', loginData?.data?.user?.isHost);
    const token = loginData?.data?.accessToken;

    // Try listing create
    const r = await globalThis.fetch('http://localhost:3000/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
            title: 'Test Listing Newman',
            description: 'Test listing created by newman',
            pricePerDay: 50,
            categoryId: '4976a803-5f4c-4f1a-8108-9269378338db',
            availabilityType: 'DAILY',
            address: '123 Test St, Paris',
            latitude: 48.8566,
            longitude: 2.3522,
            images: ['/placeholder.png']
        })
    });
    const d = await r.json();
    console.log('Listing create status:', r.status);
    console.log(JSON.stringify(d, null, 2));
}
test();
