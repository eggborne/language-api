const express = require('express');
const cors = require('cors');
const { generateBoard } = require('./puzzleService');

const app = express();
const port = process.env.PORT || 3000;
const prefix = '/language-api';

app.use(cors());
app.use(express.json());

// generate

app.post(`${prefix}/generateBoggle`, async (req, res) => {
  try {
    const options = req.body;
    const puzzle = await generateBoard(options);
    if (puzzle) {
      res.json(puzzle);
    } else {
      return res.status(500).send('Too many attempts');
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('Puzzle creation error: ' + error.message);
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});