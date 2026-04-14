const newman = require('newman');
const fs = require('fs');

newman.run({
    collection: require('./postman_rent_everything_collection_v5.json'),
    environment: require('./postman_rent_everything_env_v5.json'),
    delayRequest: 300
}).on('request', (error, args) => {
    if (args.item.name.includes('Send message')) {
        const out = {
            status: args.response.code,
            body: args.response.stream.toString()
        };
        fs.writeFileSync('chat_out.json', JSON.stringify(out, null, 2));
    }
});
