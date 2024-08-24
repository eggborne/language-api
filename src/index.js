const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { generatePuzzle, solveBoggle } = require('./services/boggleService');
const isPronounceable = require('./pronounceabilityService');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { pruneLetterListCollection } = require('./pruneList');
const { collectTrainingData } = require('./collectTrainingData');
const { arrayToSquareMatrix, averageOfValues, convertMilliseconds } = require('./scripts/util');
const { getTotalWordsPrediction, getClosestPuzzleToTotal } = require('./services/predictionService');
const { getBestLists, sendListToRemote } = require('./scripts/research');
const { trainingDataLocalPath } = require('./config.json');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;
const prefix = '/language-api';

app.use(cors());
app.use(express.json());

const minifyAndCompress = (jsonData) => {
  const minifiedData = JSON.stringify(jsonData);
  const compressedData = zlib.gzipSync(minifiedData);
  return compressedData;
};

async function collect(repetitions, saveLocally, push) {
  const startTime = Date.now();
  let data = await collectTrainingData(repetitions);
  const quantity = data.length;
  console.log('Time per item ------>', (quantity / (Date.now() - startTime)));
  if (saveLocally) {
    const compressedData = minifyAndCompress(data);
    const trainingDataDir = path.resolve(__dirname, trainingDataLocalPath);
    const filePath = path.join(trainingDataDir, `training_data-${repetitions}.gz`);
    fs.writeFileSync(filePath, compressedData);
    console.log(`Wrote new list locally.`);
  }
  if (push) {
    console.log(`\nPushing to GitHub...`);
    const gitCommand = `cd ${trainingDataDir} && git add . && git commit -m "Update training data - ${quantity}" && git push origin main`;
    const { stdout, stderr } = await execAsync(gitCommand);
    console.log('Git output:', stdout);
    if (stderr) {
      console.log('Git error output:', stderr);
    }
  }
  return data;
}

async function prune(repetitions) {
  const listDataDir = path.resolve(__dirname, `${trainingDataLocalPath}/research`);
  const filePath = path.join(listDataDir, `best-lists.json`);
  const existingList = JSON.parse(fs.readFileSync(filePath).toString());
  const { prunedList, totalAverage } = await pruneLetterListCollection(existingList, repetitions);
  return { prunedList, totalAverage };
}

if (process.env.NODE_ENV === 'development') {

  // predict 

  app.post(`${prefix}/predict`, async (req, res) => {
    const { letterList } = req.body;
    try {
      const startTime = Date.now();
      const matrix = arrayToSquareMatrix(letterList.split(''));
      const prediction = await getTotalWordsPrediction(matrix);
      console.log('Took', convertMilliseconds(Date.now() - startTime), '-> PREDICTION FOR', letterList, prediction);
      res.status(400).json(prediction);
    } catch (error) {
      console.error('Error applying model:', error);
      res.status(500).send(`Error applying model: ${error}`);
    }
  });

  app.post(`${prefix}/getBestPuzzle`, async (req, res) => {
    const { totalWordTarget, repetitions } = req.body;
    try {
      const startTime = Date.now();
      const { bestPuzzle, closestOffBy } = await getClosestPuzzleToTotal(totalWordTarget, repetitions);
      console.log(bestPuzzle, closestOffBy, '- closest to', totalWordTarget, '? Took', convertMilliseconds(Date.now() - startTime));
      res.status(400).json({
        best: bestPuzzle,
        offby: closestOffBy
      });
    } catch (error) {
      console.error('Error applying model:', error);
      res.status(500).send(`Error applying model: ${error}`);
    }
  });

  // collect

  app.post(`${prefix}/collect`, async (req, res) => {
    const { cycles, repetitions, saveLocally, push } = req.body;
    try {
      console.log('\nCollecting', cycles, 'cycles of', repetitions, 'puzzles');
      for (let i = 0; i < cycles; i++) {
        await collect(repetitions, saveLocally, push);
        const best = await getBestLists();
        const bestAverage = averageOfValues(best, 5);
        console.log(`\nNew average totalWords for ${Object.values(best).length} special puzzles ---> `, bestAverage, `\n`);
      }
      res.status(400).json('\n', cycles, 'cycles of', repetitions, 'finished.');
    } catch (error) {
      console.error('Error generating training data:', error);
      res.status(500).send('Failed to generate training data');
    }
  });

  // prune

  app.post(`${prefix}/prune`, async (req, res) => {
    const { repetitions } = req.body;
    try {
      const { prunedList, totalAverage } = await prune(repetitions);
      console.log(`\New average totalWords for ${Object.values(prunedList).length} puzzles ---> `, totalAverage, `\n`);
      res.status(400).json(`New total average: ${totalAverage}`);

    } catch (error) {
      console.error('An error occurred during pruning:', error);
    }
  });

}

// generate

app.post(`${prefix}/generateBoggle`, async (req, res) => {
  try {
    const options = req.body;
    const genStart = Date.now();
    const puzzle = await generatePuzzle(options);
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

//solve

app.get(`${prefix}/solveBoggle`, async (req, res) => {
  try {
    const userQueryString = Object.keys(req.query)[0];
    const genStart = Date.now();
    console.log('userQuertyString', userQueryString);
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

// pronunciation

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