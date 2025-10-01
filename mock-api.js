const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config', 'config.yml');
const SCHEMA_FILE = path.join(__dirname, 'config', 'config.schema.json');

// Read your actual config files
let config = {};
let schema = {};

try {
  const yaml = require('js-yaml');
  const configYaml = fs.readFileSync(CONFIG_FILE, 'utf8');
  config = yaml.load(configYaml);
} catch (e) {
  console.warn('Could not load config.yml, using minimal config');
  config = {
    cameras: {},
    mqtt: { enabled: false },
    detectors: { cpu: { type: 'cpu' } }
  };
}

try {
  schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
} catch (e) {
  console.error('Could not load schema:', e.message);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`${req.method} ${req.url}`);

  if (req.url === '/api/config/schema.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(schema));
  } else if (req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
  } else if (req.url === '/api/config/raw') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } else if (req.url.startsWith('/api/config/set')) {
    // Mock save - just return success
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Config updated (mock)' }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(5001, () => {
  console.log('Mock Frigate API running on http://localhost:5001');
  console.log('Endpoints:');
  console.log('  - GET /api/config/schema.json');
  console.log('  - GET /api/config');
  console.log('  - GET /api/config/raw');
  console.log('  - PUT /api/config/set?...');
});
