const fs = require('fs');
const swagger = JSON.parse(fs.readFileSync('swagger.json', 'utf8'));

const collection = {
    info: {
        name: "RentEverything API Tests",
        description: "Automated API tests generated from Swagger docs.",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    variable: [
        { key: "baseUrl", value: "http://localhost:3000", type: "string" },
        { key: "accessToken", value: "", type: "string" },
        { key: "refreshToken", value: "", type: "string" }
    ],
    item: []
};

const moduleGroups = {};

for (const [path, methods] of Object.entries(swagger.paths)) {
    for (const [method, details] of Object.entries(methods)) {
        const tag = (details.tags && details.tags.length > 0) ? details.tags[0] : "Misc";

        if (!moduleGroups[tag]) {
            moduleGroups[tag] = { name: tag, item: [] };
        }

        const item = {
            name: details.summary || `${method.toUpperCase()} ${path}`,
            request: {
                method: method.toUpperCase(),
                header: [],
                url: {
                    raw: `{{baseUrl}}${path.replace(/\{([^}]+)\}/g, ':$1')}`,
                    host: ["{{baseUrl}}"],
                    path: path.split('/').filter(Boolean).map(p => p.startsWith('{') && p.endsWith('}') ? `:${p.slice(1, -1)}` : p),
                    variable: []
                }
            },
            event: []
        };

        // Add path variables
        const pathVars = path.match(/\{([^}]+)\}/g);
        if (pathVars) {
            pathVars.forEach(v => {
                const name = v.slice(1, -1);
                item.request.url.variable.push({
                    key: name,
                    value: `{{${name}}}`
                });
            });
        }

        // Add Body (if applicable)
        let hasBody = false;
        if (details.requestBody && details.requestBody.content && details.requestBody.content['application/json']) {
            const schemaName = details.requestBody.content['application/json'].schema?.$ref?.split('/')?.pop();
            const schemaObj = swagger.components?.schemas?.[schemaName];
            let bodyProps = {};
            if (schemaObj && schemaObj.properties) {
                for (const [k, v] of Object.entries(schemaObj.properties)) {
                    bodyProps[k] = v.example !== undefined ? v.example : (v.type === 'string' ? "test" : (v.type === 'number' ? 123 : (v.type === 'boolean' ? true : null)));
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

        // Auth handling
        let requiresAuth = false;
        if (details.security && details.security.length > 0) {
            requiresAuth = true;
            item.request.auth = {
                type: "bearer",
                bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }]
            };
        }

        // Tests (post-request script)
        let testScript = `
pm.test("Status code is 2xx", function () {
    pm.response.to.be.success;
});
pm.test("Response has JSON structure", function () {
    pm.response.to.be.json;
});
if (pm.response.code >= 200 && pm.response.code < 300) {
    var jsonData = pm.response.json();
    pm.test("Success property is true (if wrapped)", function () {
        if(jsonData.hasOwnProperty('success')) {
            pm.expect(jsonData.success).to.be.true;
        }
    });
}
`;

        if (path === '/api/auth/login' && method === 'post') {
            testScript += `
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    var payload = jsonData.data || jsonData;
    if (payload.accessToken) {
        pm.environment.set("accessToken", payload.accessToken);
        pm.collectionVariables.set("accessToken", payload.accessToken);
    }
    if (payload.refreshToken) {
        pm.environment.set("refreshToken", payload.refreshToken);
        pm.collectionVariables.set("refreshToken", payload.refreshToken);
    }
}
`;
        }

        if (path === '/api/auth/refresh' && method === 'post') {
            item.request.body = {
                mode: "raw",
                raw: JSON.stringify({ refreshToken: "{{refreshToken}}" }, null, 2),
                options: { raw: { language: "json" } }
            };
            if (!hasBody) item.request.header.push({ key: "Content-Type", value: "application/json" });

            testScript += `
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    var payload = jsonData.data || jsonData;
    if (payload.accessToken) {
        pm.environment.set("accessToken", payload.accessToken);
        pm.collectionVariables.set("accessToken", payload.accessToken);
    }
}
`;
        }

        item.event.push({
            listen: "test",
            script: {
                exec: testScript.trim().split('\\n'),
                type: "text/javascript"
            }
        });

        moduleGroups[tag].item.push(item);
    }
}

// Convert object to array
collection.item = Object.values(moduleGroups);

// Ensure Auth is first and Login is prominent
const authFolder = collection.item.find(i => i.name.toLowerCase() === 'auth');
if (authFolder) {
    collection.item = [authFolder, ...collection.item.filter(i => i !== authFolder)];
    const loginReq = authFolder.item.find(i => i.request.url.raw.includes('/login'));
    if (loginReq) {
        authFolder.item = [loginReq, ...authFolder.item.filter(i => i !== loginReq)];
    }
}

fs.writeFileSync('postman_rent_everything_tests.json', JSON.stringify(collection, null, 2));
console.log('Collection saved as postman_rent_everything_tests.json');
