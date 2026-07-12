import express from 'express';
const app = express();
try {
  app.get('*', (req, res) => {
    res.send('ok');
  });
  console.log('Successfully registered * route');
} catch (e) {
  console.error('Failed to register * route:');
  console.error(e);
}
