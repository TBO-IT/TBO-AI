const duckdb = require('duckdb');
console.log('Connecting...');
const db = new duckdb.Database('md:?motherduck_token=' + process.env.MOTHERDUCK_TOKEN, (err) => {
    if (err) {
        console.error('DB Init Error:', err);
    } else {
        console.log('DB init success');
        db.all('SELECT 1 as x', (err, res) => {
            if (err) console.error('Query Error:', err);
            else console.log('Query success:', res);
        });
    }
});
