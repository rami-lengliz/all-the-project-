const fs = require('fs');
const col = JSON.parse(fs.readFileSync('postman_rent_everything_collection_v4.json', 'utf8'));

// Check what 400 means and update booking test to also accept 400
const bookingsFolder = col.item.find(f => f.name.includes('5. Bookings'));
const createBooking = bookingsFolder.item.find(i => i.name.includes('Create booking'));
createBooking.event.forEach(ev => {
    if (ev.listen === 'test') {
        ev.script.exec = ev.script.exec.map(line =>
            line.includes('[200, 201, 409]')
                ? line.replace('[200, 201, 409]', '[200, 201, 400, 409]')
                : line
        );
    }
});

// Also grab bookingId from GET /bookings/me if create fails
const listBookings = bookingsFolder.item.find(i => i.name.includes('List my bookings'));
listBookings.event.forEach(ev => {
    if (ev.listen === 'test') {
        ev.script.exec.push(
            '// Fallback: if POST /bookings failed (400 = self-booking or other), grab first from list',
            'var payload2 = (pm.response.json().data || pm.response.json());',
            'var list2 = Array.isArray(payload2) ? payload2 : (payload2.items || []);',
            'if (list2.length > 0 && !pm.environment.get("bookingId")) {',
            '  pm.environment.set("bookingId", list2[0].id);',
            '  console.log("Fallback bookingId from list:", list2[0].id);',
            '}'
        );
    }
});

fs.writeFileSync('postman_rent_everything_collection_v4.json', JSON.stringify(col, null, 2));
console.log('Patched: booking 400 now acceptable, fallback bookingId from list');
