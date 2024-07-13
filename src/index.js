const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./sequelize');
const Word = require('./models/word');
const { generateBoard } = require('./puzzleService');

const app = express();
const port = process.env.PORT || 3000;

// Use CORS middleware
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Log every request received
app.use((req, res, next) => {
  console.log('Received request:', req.method, req.path);
  next(); // Continue to the next middleware or route handler
});

const testDBConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};
testDBConnection();

const prefix = '/language-api';

// check

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

// generate

const defaultPuzzleOptions = {
  dimensions: { width: 4, height: 4 },
  letterDistribution: 'scrabble',
  maximumPathLength: 20,
  averageWordLengthFilter: undefined,
  totalWordLimits: undefined,
  wordLengthLimits: undefined,
  letters: undefined,
};

const resolvePuzzleOptions = (options) => {
  const width = options.dimensions?.width || defaultPuzzleOptions.dimensions.width;
  const height = options.dimensions?.height || defaultPuzzleOptions.dimensions.height;
  const dimensions = {
    width: options.dimensions?.width ? options.dimensions.width : height,
    height: options.dimensions?.height ? options.dimensions.height : width
  };
  return {
    ...defaultPuzzleOptions,
    ...options,
    dimensions,
  };
};

app.post(`${prefix}/generate`, async (req, res) => {
  try {
    const options = req.body;
    const mergedOptions = resolvePuzzleOptions(options);
    console.log('mergedOptions', mergedOptions);
    if (mergedOptions.letters && mergedOptions.letters.length !== (mergedOptions.dimensions.width * mergedOptions.dimensions.height)) {
      return res.status(500).send('Wrong size letter list for length: ' + mergedOptions.letters.length + ' and dimensions: ' + mergedOptions.dimensions.width + ' by ' + mergedOptions.dimensions.height);
    }
    const puzzle = await generateBoard(mergedOptions);
    if (puzzle) {
      res.json(puzzle)
    } else {
      return res.status(500).send('Too many attempts');
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('Puzzle creation error: ' + error.message);
  }
});

console.log('\nServing static files from:', path.join(__dirname, 'public'));
app.use(prefix, express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});