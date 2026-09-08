const { spawn } = require('child_process');
const http = require('http');

const server = spawn('node', ['bin/autonmax-launch.js'], {
  env: { ...process.env, PORT: 3001 },
  cwd: __dirname
});

let serverReady = false;

server.stdout.on('data', (data) => {
  const output = data.toString();
  // console.log(output);
  if (output.includes('Servidor Autonmax ativo em')) {
    serverReady = true;
    console.log('Server is ready! Sending request...');
    sendRequest();
  }
});

server.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

function sendRequest() {
  const data = JSON.stringify({ code: 'dummy' });
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/google',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = http.request(options, (res) => {
    let resData = '';
    res.on('data', chunk => resData += chunk);
    res.on('end', () => {
      console.log('RESPONSE:', resData);
      server.kill();
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e.message);
    server.kill();
  });

  req.write(data);
  req.end();
}

setTimeout(() => {
  if (!serverReady) {
    console.log('Timeout waiting for server');
    server.kill();
  }
}, 10000);
