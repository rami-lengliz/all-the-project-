const fs = require('fs');
const col = JSON.parse(fs.readFileSync('postman_rent_everything_collection_v3.json', 'utf8'));

// Find the Listings folder
const listingsFolder = col.item.find(f => f.name.includes('4. Listings'));
if (!listingsFolder) { console.error('Listings folder not found'); process.exit(1); }

// Find the Create listing request
const createListing = listingsFolder.item.find(i => i.name.includes('Create a listing'));
if (!createListing) { console.error('Create listing not found'); process.exit(1); }

// Change body from raw JSON to formdata with file
createListing.request.header = createListing.request.header.filter(h => h.key !== 'Content-Type');
delete createListing.request.body;

createListing.request.body = {
    mode: "formdata",
    formdata: [
        { key: "title", value: "Newman Test Listing", type: "text" },
        { key: "description", value: "Automated test listing created by Newman", type: "text" },
        { key: "pricePerDay", value: "50", type: "text" },
        { key: "categoryId", value: "{{categoryId}}", type: "text" },
        { key: "availabilityType", value: "DAILY", type: "text" },
        { key: "bookingType", value: "DAILY", type: "text" },
        { key: "address", value: "123 Test Street, Paris", type: "text" },
        { key: "latitude", value: "48.8566", type: "text" },
        { key: "longitude", value: "2.3522", type: "text" },
        {
            key: "images",
            type: "file",
            src: "./frontend/public/placeholder.png"
        }
    ]
};

fs.writeFileSync('postman_rent_everything_collection_v3.json', JSON.stringify(col, null, 2));
console.log('Updated listing create to use form-data with file upload');
