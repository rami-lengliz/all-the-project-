const fs = require('fs');

const v5Col = JSON.parse(fs.readFileSync('postman_rent_everything_collection_v5.json', 'utf8'));

// Update name/desc
v5Col.info.name = "RentEverything API Workflow v6 (Full Lifecycle)";
v5Col.info.description = "Proves the entire marketplace lifecycle from User Registration to Booking, Payment, Completion, Review, and Chat.";

// Find Payments folder
const payFolder = v5Col.item.find(f => f.name.includes('Payments'));
payFolder.name = '6. Payments (Renter)';
// Add Pay booking request
payFolder.item.push({
    "name": "Pay booking",
    "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{renterToken}}" }] },
        "body": {
            "mode": "raw",
            "raw": "{\n  \"paymentToken\": \"mock-token-123\"\n}"
        },
        "url": { "raw": "{{baseUrl}}/api/bookings/{{bookingId}}/pay", "host": ["{{baseUrl}}"], "path": ["api", "bookings", "{{bookingId}}", "pay"] }
    },
    "event": [
        {
            "listen": "prerequest",
            "script": { "exec": ["if(!pm.environment.get('bookingId')) pm.execution.skipRequest();"], "type": "text/javascript" }
        },
        {
            "listen": "test",
            "script": { "exec": ["pm.test('Paid', function() { pm.expect(pm.response.code).to.be.oneOf([200, 201]); });"], "type": "text/javascript" }
        }
    ]
});

// Create Completion Folder (Insert before Reviews)
const compFolder = {
    "name": "7. Completion (Host)",
    "item": [
        {
            "name": "Complete booking",
            "request": {
                "method": "PATCH",
                "header": [],
                "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{hostToken}}" }] },
                "url": { "raw": "{{baseUrl}}/api/bookings/{{bookingId}}/complete", "host": ["{{baseUrl}}"], "path": ["api", "bookings", "{{bookingId}}", "complete"] }
            },
            "event": [
                {
                    "listen": "prerequest",
                    "script": { "exec": ["if(!pm.environment.get('bookingId')) pm.execution.skipRequest();"], "type": "text/javascript" }
                },
                {
                    "listen": "test",
                    "script": { "exec": ["pm.test('Completed', function() { pm.expect(pm.response.code).to.be.oneOf([200, 201]); });"], "type": "text/javascript" }
                }
            ]
        }
    ]
};

// Find review folder, it was #7.
const reviewFolderIndex = v5Col.item.findIndex(f => f.name.includes('Reviews'));
// Update numbering
v5Col.item[reviewFolderIndex].name = '8. Reviews (Renter)';
const chatFolderIndex = v5Col.item.findIndex(f => f.name.includes('Chat'));
v5Col.item[chatFolderIndex].name = '9. Chat (Renter & Host)';

// Add Completion folder before Reviews
v5Col.item.splice(reviewFolderIndex, 0, compFolder);

// Add review retrieval
const reviewFolder = v5Col.item.find(f => f.name.includes('Reviews'));
reviewFolder.item[0].event[1].script.exec.push(
    "var p = pm.response.json();",
    "if(p.data && p.data.id) pm.environment.set('reviewId', p.data.id);",
    "if(p.id) pm.environment.set('reviewId', p.id);"
);

reviewFolder.item.push({
    "name": "Get single review",
    "request": {
        "method": "GET",
        "header": [],
        "url": { "raw": "{{baseUrl}}/api/reviews/{{reviewId}}", "host": ["{{baseUrl}}"], "path": ["api", "reviews", "{{reviewId}}"] }
    },
    "event": [
        {
            "listen": "prerequest",
            "script": { "exec": ["if(!pm.environment.get('reviewId')) pm.execution.skipRequest();"], "type": "text/javascript" }
        },
        {
            "listen": "test",
            "script": { "exec": ["pm.test('Got Review', function() { pm.expect(pm.response.code).to.be.oneOf([200, 201]); });"], "type": "text/javascript" }
        }
    ]
});

// Update tests logic for Authorize Payment to not assert 400 since it should pass!
const authPay = payFolder.item.find(i => i.name.includes('Authorize'));
authPay.event[1].script.exec[0] = "pm.test('Authorized', function() { pm.expect(pm.response.code).to.be.oneOf([200, 201, 204]); });";

fs.writeFileSync('postman_rent_everything_collection_v6.json', JSON.stringify(v5Col, null, 2));

const env = JSON.parse(fs.readFileSync('postman_rent_everything_env_v5.json', 'utf8'));
env.id = "rent-everything-local-v6";
env.name = "RentEverything Local Env v6";
env.values.push({ "key": "reviewId", "value": "", "type": "default", "enabled": true });
fs.writeFileSync('postman_rent_everything_env_v6.json', JSON.stringify(env, null, 2));

console.log('v6 created!');
