const http = require('http');

http.get('http://localhost:3000/', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('--- HEAD LINES IN HTTP RESPONSE ---');
    const lines = data.split('\n');
    lines.forEach((line) => {
      if (line.includes('<title>') || line.includes('rel="icon"') || line.includes('rel="shortcut icon"') || line.includes('rel="apple-touch-icon"') || line.includes('name="theme-color"')) {
        console.log(line.trim());
      }
    });
  });
});
