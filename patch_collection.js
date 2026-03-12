const fs = require('fs');
const col = JSON.parse(fs.readFileSync('postman_rent_everything_collection_v3.json', 'utf8'));

const hostFolder = col.item.find(f => f.name.includes('Host Setup'));
if (hostFolder) {
    const relogin = hostFolder.item.find(i => i.name.includes('Re-login'));
    if (relogin) {
        const hasPrereq = relogin.event && relogin.event.find(e => e.listen === 'prerequest');
        if (!hasPrereq) {
            relogin.event = relogin.event || [];
            relogin.event.unshift({
                listen: 'prerequest',
                script: {
                    exec: [
                        'var email = pm.environment.get("testUserEmail") || pm.environment.get("loginEmail");',
                        'var pass = pm.environment.get("testUserPassword") || pm.environment.get("loginPassword");',
                        'pm.environment.set("_loginEmail", email);',
                        'pm.environment.set("_loginPassword", pass);'
                    ],
                    type: 'text/javascript'
                }
            });
            console.log('Added prerequest to Re-login');
        } else {
            console.log('Already has prerequest');
        }
    }
}

fs.writeFileSync('postman_rent_everything_collection_v3.json', JSON.stringify(col, null, 2));
console.log('Done');
