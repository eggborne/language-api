const express = require('express');
const cors = require('cors');
const { generateBoard, solveBoggle } = require('./boggleService');
const { isPronounceable } = require('./pronounceabilityService');

const app = express();
const port = process.env.PORT || 3000;
const prefix = '/language-api';

app.use(cors());
app.use(express.json());

// generate

app.post(`${prefix}/generateBoggle`, async (req, res) => {
  try {
    const options = req.body;
    const genStart = Date.now();
    const puzzle = await generateBoard(options);
    const serverDuration = Date.now() - genStart;
    if (puzzle.data) {
      res.json({
        success: true,
        message: `${puzzle.message} (server took ${serverDuration}ms)`,
        data: { ...puzzle.data, serverDuration }
      });
    } else {
      res.status(400).json({
        success: false,
        message: `${puzzle.message} (server took ${serverDuration}ms)`,
        data: { serverDuration }
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('Puzzle creation error: ' + error.message);
  }
});

app.get(`${prefix}/solveBoggle`, async (req, res) => {
  try {
    const userQueryString = Object.keys(req.query)[0];
    const genStart = Date.now();
    const solveResponse = await solveBoggle(userQueryString);
    const serverDuration = Date.now() - genStart;
    if (solveResponse.data) {
      res.json({
        success: true,
        message: `${solveResponse.message} (server took ${serverDuration}ms)`,
        data: { ...solveResponse.data }
      });
    } else {
      res.status(400).json({
        success: false,
        message: `${solveResponse.message} (server took ${serverDuration}ms)`,
        data: { serverDuration }
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('Puzzle solving error: ' + error.message);
  }
});

app.get(`${prefix}/checkPronounceability`, async (req, res) => {
  try {
    const userQueryString = Object.keys(req.query)[0];
    const genStart = Date.now();
    const pronounceableResponse = isPronounceable(userQueryString);
    const serverDuration = Date.now() - genStart;
    console.log('/checkPronounceability got resp', pronounceableResponse);

    if (pronounceableResponse.data) {
      res.json({
        success: true,
        message: `${pronounceableResponse.message} (server took ${serverDuration}ms)`,
        data: { ...pronounceableResponse.data }
      });
    } else {
      res.status(400).json({
        success: false,
        message: `${pronounceableResponse.message} (server took ${serverDuration}ms)`,
        data: { serverDuration }
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('Pronounceablility determinaton error: ' + error.message);
  }
});

app.listen(port, () => {
  console.log(`
******************************************
                                          |
 Server running on http://localhost:${port}  |
                                          |
******************************************
`);
});