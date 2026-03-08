const fs = require('fs');
const swagger = JSON.parse(fs.readFileSync('swagger.json', 'utf8'));

// Custom script generation
function generateTestScript(path, method, moduleTag) {
    let script = `
pm.test("Status code is 2xx", function () {
    pm.response.to.be.success;
});
pm.test("Response has JSON structure", function () {
    pm.response.to.be.json;
});
if (pm.response.code >= 200 && pm.response.code < 300) {
    var jsonData = pm.response.json();
    var payload = jsonData.data || jsonData;
`;

    // Auth saves
    if (path === '/api/auth/login' && method === 'post') {
        script += `
    if (payload.accessToken) pm.environment.set("accessToken", payload.accessToken);
    if (payload.refreshToken) pm.environment.set("refreshToken", payload.refreshToken);
    if (payload.user && payload.user.id) pm.environment.set("userId", payload.user.id);
`;
    }
    if (path === '/api/auth/refresh' && method === 'post') {
        script += `
    if (payload.accessToken) pm.environment.set("accessToken", payload.accessToken);
`;
    }

    // ID saves based on POST requests taking standard entities
    if (method === 'post') {
        if (path === '/api/categories') script += `    if (payload.id) pm.environment.set("categoryId", payload.id);\n`;
        if (path === '/api/listings') script += `    if (payload.id) pm.environment.set("listingId", payload.id);\n`;
        if (path === '/api/bookings') script += `    if (payload.id) pm.environment.set("bookingId", payload.id);\n`;
        if (path.startsWith('/api/reviews')) script += `    if (payload.id) pm.environment.set("reviewId", payload.id);\n`;
        if (path === '/chat/conversations') script += `    if (payload.id) pm.environment.set("conversationId", payload.id);\n`;
    }

    // Handle generic GET returning arrays, grab the first one if we don't have an ID
    if (method === 'get') {
        if (path === '/api/categories') script += `    if (Array.isArray(payload) && payload.length > 0) pm.environment.set("categoryId", payload[0].id);\n`;
        if (path === '/api/listings') script += `    if (Array.isArray(payload) && payload.length > 0 && payload[0].id) pm.environment.set("listingId", payload[0].id);\n`;
        if (path === '/api/admin/users') script += `    if (Array.isArray(payload) && payload.length > 0 && payload[0].id) pm.environment.set("userId", payload[0].id);\n`;
    }

    script += `}\n`;
    return script.trim().split('\n');
}

const groups = {
    "Auth": [],
    "Host Setup": [],
    "Categories": [],
    "Listings": [],
    "Bookings": [],
    "Payments": [],
    "Reviews": [],
    "Chat": [],
    "AI": [],
    "Admin": [] // admin flow separate
};

for (const [path, methods] of Object.entries(swagger.paths)) {
    for (const [method, details] of Object.entries(methods)) {
        const rawTag = (details.tags && details.tags.length > 0) ? details.tags[0] : "Misc";

        let targetGroup = "Misc";
        if (path.includes('/admin')) targetGroup = "Admin";
        else if (path.includes('/auth')) targetGroup = "Auth";
        else if (path.includes('/become-host')) targetGroup = "Host Setup";
        else if (path.includes('/users')) targetGroup = "Auth";
        else if (path.includes('/categories')) targetGroup = "Categories";
        else if (path.includes('/listings')) targetGroup = "Listings";
        else if (path.includes('/bookings')) targetGroup = "Bookings";
        else if (path.includes('/payments')) targetGroup = "Payments";
        else if (path.includes('/reviews')) targetGroup = "Reviews";
        else if (path.includes('/chat')) targetGroup = "Chat";
        else if (path.includes('/ai')) targetGroup = "AI";

        if (!groups[targetGroup]) groups[targetGroup] = [];

        // Path Variable Mapping
        let finalPath = path;
        finalPath = finalPath.replace('{id}', (match) => {
            if (path.includes('/categories')) return ':categoryId';
            if (path.includes('/listings')) return ':listingId';
            if (path.includes('/bookings')) return ':bookingId';
            if (path.includes('/reviews')) return ':reviewId';
            if (path.includes('/users') || path.includes('/hosts')) return ':userId';
            if (path.includes('/conversations')) return ':conversationId';
            if (path.includes('/payouts')) return ':payoutId';
            return ':id';
        });

        finalPath = finalPath.replace('{userId}', ':userId');
        finalPath = finalPath.replace('{bookingId}', ':bookingId');

        const item = {
            name: details.summary || `${method.toUpperCase()} ${path}`,
            request: {
                method: method.toUpperCase(),
                header: [],
                url: {
                    raw: `{{baseUrl}}${finalPath}`,
                    host: ["{{baseUrl}}"],
                    path: finalPath.split('/').filter(Boolean),
                    variable: [],
                    query: []
                }
            },
            event: [
                {
                    listen: "test",
                    script: {
                        exec: generateTestScript(path, method, targetGroup),
                        type: "text/javascript"
                    }
                }
            ]
        };

        // Construct URL variables (the :var parts)
        const urlSegments = item.request.url.path;
        for (let i = 0; i < urlSegments.length; i++) {
            if (urlSegments[i].startsWith(':')) {
                const varName = urlSegments[i].slice(1);
                item.request.url.variable.push({
                    key: varName,
                    value: `{{${varName}}}`
                });
            }
        }

        // categories/nearby special query params
        if (path === '/api/categories/nearby' && method === 'get') {
            item.request.url.query = [
                { key: "lat", value: "48.8566" },
                { key: "lng", value: "2.3522" },
                { key: "radiusKm", value: "10" }
            ];
            item.request.url.raw += "?lat=48.8566&lng=2.3522&radiusKm=10";
        }

        // Add Body
        let hasBody = false;
        if (details.requestBody && details.requestBody.content && details.requestBody.content['application/json']) {
            const schemaName = details.requestBody.content['application/json'].schema?.$ref?.split('/')?.pop();
            const schemaObj = swagger.components?.schemas?.[schemaName];
            let bodyProps = {};
            if (schemaObj && schemaObj.properties) {
                for (const [k, v] of Object.entries(schemaObj.properties)) {
                    // Provide basic examples if undefined
                    let val = v.example;
                    if (val === undefined) {
                        if (v.type === 'string') val = k.includes('Id') ? `{{${k}}}` : "test";
                        else if (v.type === 'number') val = 123;
                        else if (v.type === 'boolean') val = true;
                        else val = null;
                    }
                    bodyProps[k] = val;
                }
            }
            item.request.body = {
                mode: "raw",
                raw: Object.keys(bodyProps).length > 0 ? JSON.stringify(bodyProps, null, 2) : "{}",
                options: { raw: { language: "json" } }
            };
            item.request.header.push({ key: "Content-Type", value: "application/json" });
            hasBody = true;
        }

        // Refresh Token manual override
        if (path === '/api/auth/refresh' && method === 'post') {
            item.request.body = {
                mode: "raw",
                raw: JSON.stringify({ refreshToken: "{{refreshToken}}" }, null, 2),
                options: { raw: { language: "json" } }
            };
            if (!hasBody) item.request.header.push({ key: "Content-Type", value: "application/json" });
        }

        // Auth handling
        if (details.security && details.security.length > 0) {
            item.request.auth = {
                type: "bearer",
                bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }]
            };
        }

        groups[targetGroup].push(item);
    }
}

// Ensure Login is the first item in Auth
const authItems = groups["Auth"];
const loginItemIdx = authItems.findIndex(i => i.request.url.raw.includes('/login'));
if (loginItemIdx > -1) {
    const loginItem = authItems.splice(loginItemIdx, 1)[0];
    groups["Auth"] = [loginItem, ...authItems];
}

const collection = {
    info: {
        name: "RentEverything API Workflow",
        description: "Stateful automated API tests.",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    item: [
        { name: "1. Auth", item: groups["Auth"] },
        { name: "2. Host Setup", item: groups["Host Setup"] },
        { name: "3. Categories", item: groups["Categories"] },
        { name: "4. Listings", item: groups["Listings"] },
        { name: "5. Bookings", item: groups["Bookings"] },
        { name: "6. Payments", item: groups["Payments"] },
        { name: "7. Reviews", item: groups["Reviews"] },
        { name: "8. Chat", item: groups["Chat"] },
        { name: "9. AI", item: groups["AI"] },
        {
            name: "10. Admin Flow (Optional)",
            description: "Requires an admin user access token.",
            item: groups["Admin"]
        }
    ].filter(g => g.item && g.item.length > 0)
};

fs.writeFileSync('postman_rent_everything_collection_v2.json', JSON.stringify(collection, null, 2));

const env = {
    name: "RentEverything Local Env",
    values: [
        { key: "baseUrl", value: "http://localhost:3000", type: "default", enabled: true },
        { key: "accessToken", value: "", type: "default", enabled: true },
        { key: "refreshToken", value: "", type: "default", enabled: true },
        { key: "userId", value: "", type: "default", enabled: true },
        { key: "categoryId", value: "", type: "default", enabled: true },
        { key: "listingId", value: "", type: "default", enabled: true },
        { key: "bookingId", value: "", type: "default", enabled: true },
        { key: "reviewId", value: "", type: "default", enabled: true },
        { key: "conversationId", value: "", type: "default", enabled: true }
    ]
};

fs.writeFileSync('postman_rent_everything_env.json', JSON.stringify(env, null, 2));
