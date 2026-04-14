const fs = require('fs');
const newman = require('newman');

newman.run({
    collection: require('./postman_rent_everything_collection_v4.json'),
    environment: require('./postman_rent_everything_env_v4.json'),
    delayRequest: 500
}).on('request', (error, args) => {
    if (error) {
        console.error(error);
        return;
    }
    const reqName = args.item.name;
    if (reqName === 'Create booking') {
        console.log('--- Create Booking Request ---');
        console.log(args.request.body.raw);
        console.log('--- Response Status:', args.response.code);
        console.log('--- Response Body ---');
        console.log(args.response.stream.toString());
    }
});
