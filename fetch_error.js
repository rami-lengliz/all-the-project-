const fs = require('fs');

const d = async () => {
    try {
        const loginRes = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emailOrPhone: 'newmanhost_1772937678@rent.test', password: 'Password123!' })
        });
        const loginDat = await loginRes.json();
        const t = loginDat.data.accessToken;

        const res = await fetch('http://localhost:3000/api/bookings', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
            body: JSON.stringify({ listingId: 'df0f0bfc-5813-41cf-aae3-891feeb46de7', startDate: '2026-07-01', endDate: '2026-07-03' })
        });

        fs.writeFileSync('booking_error.txt', await res.text());
        console.log('done writing');
    } catch (e) {
        console.error(e);
    }
}; d();
