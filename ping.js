const http = require('http');

setInterval(() => {
  http.get('https://firebasepassword.onrender.com', (res) => {
    console.log(`Pinged server: ${res.statusCode}`);
  }).on('error', (err) => {
    console.log('Error pinging server:', err.message);
  });
}, 2 * 60 * 1000); // har 4 minute ping
