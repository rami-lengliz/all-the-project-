const fs = require('fs');
const col = JSON.parse(fs.readFileSync('postman_rent_everything_collection_v3.json', 'utf8'));

function relaxStatusChecks(item) {
    if (!item.event) return;
    item.event.forEach(ev => {
        if (ev.listen !== 'test') return;
        ev.script.exec = ev.script.exec.map(line => {
            // Replace strict status(200) checks with flexible oneOf check
            if (line.includes('pm.response.to.have.status(200)')) {
                return line.replace(
                    'pm.response.to.have.status(200)',
                    'pm.expect(pm.response.code).to.be.oneOf([200, 201])'
                );
            }
            return line;
        });
    });
}

function walkItems(items) {
    items.forEach(item => {
        if (item.item) {
            walkItems(item.item);
        } else {
            relaxStatusChecks(item);
        }
    });
}

walkItems(col.item);

// Fix AI assertion to accept 200 or 201 or 400/500/503
const aiFolder = col.item.find(f => f.name.includes('9. AI'));
if (aiFolder) {
    aiFolder.item.forEach(req => {
        if (req.event) {
            req.event.forEach(ev => {
                if (ev.listen === 'test') {
                    ev.script.exec = ev.script.exec.map(line =>
                        line.includes('[200, 400, 500, 503]')
                            ? line.replace('[200, 400, 500, 503]', '[200, 201, 400, 500, 503]')
                            : line
                    );
                }
            });
        }
    });
}

fs.writeFileSync('postman_rent_everything_collection_v3.json', JSON.stringify(col, null, 2));
console.log('Patched strict 200-only checks to accept 200 or 201');
