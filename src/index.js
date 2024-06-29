const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./sequelize');
const Word = require('./models/word');

const app = express();
const port = process.env.PORT || 3000;

// Use CORS middleware
app.use(cors());

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
testDBConnection();

const runningLocally = __dirname.includes('dist');

const prefix = runningLocally ? '' : '/language-api';

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
    return res.status(500).send('Error occurred while checking the word ' + error.message);
  }
});

console.log('\nServing static files from:', path.join(__dirname, 'public'));
app.use(prefix, express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});