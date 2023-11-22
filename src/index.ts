import express from 'express';
import path from 'path';

import sequelize from './sequelize';
import Word from './models/word';

const app = express();
const port = process.env.PORT || 3000;

// Log every request received
app.use((req, res, next) => {
  console.log('Received request:', req.method, req.path);
  next(); // Continue to the next middleware or route handler
});

console.log("Current Environment:", process.env.NODE_ENV);

const devMode = process.env.NODE_ENV === 'development';

const testDBConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};
const runningLocally = __dirname.includes('dist');

const prefix = runningLocally ? '' : '/language-api';
// const prefix = '';

app.get(`${prefix}/check`, async (req, res) => {
  try {
    const wordToCheck = req.query.word;
    if (!wordToCheck) {
      return res.status(400).send('No word specified');
    }

    const wordExists = await Word.findOne({ where: { word: wordToCheck } });
    return res.json({ exists: !!wordExists });
  } catch (error) {
    console.error(error);
    return res.status(500).send('Error occurred while checking the word');
  }
});

console.log('\nServing static files from:', path.join(__dirname, 'public'));
// app.use(express.static(path.join(__dirname, 'public')));
app.use(prefix, express.static(path.join(__dirname, 'public')));


// Catch-all route for SPA
// app.get('*', (req, res) => {
//   console.log('Serving index.html for path:', req.path);
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

app.listen(port, () => {
  console.log(`\nServer running on http://localhost:${port}`);
});