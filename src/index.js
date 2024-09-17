const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { solveBoggle, generatePuzzleMultiThreaded } = require('./services/boggleService');
const isPronounceable = require('./services/pronounceabilityService');
const fs = require('fs');
const path = require('path');
const { arrayToSquareMatrix, convertMilliseconds, averageOfValue, buildDictionary, minifyAndCompress } = require('./scripts/util');
const { getTotalWordsPrediction, getClosestPuzzleToTotal } = require('./services/predictionService');
const { compileResearchFiles, saveResearchFile } = require('./scripts/research');
const { trainingDataLocalPath, wordLimitsForSize } = require('./config.json');
const { getTopPuzzles, getTopPuzzlesMultithreaded } = require('./getTopPuzzles');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

const BASE_PATH = process.env.BASE_PATH || '/';
console.log('\nusing base path', BASE_PATH)

app.use(cors());
app.use(express.json());

let trie;

const ACTIVE_COLLECTION_JOBS = {};

// predict 

app.post(`${BASE_PATH}predict`, async (req, res) => {
  const { letterList, model } = req.body;
  console.log('predicting for', letterList);
  try {
    const startTime = Date.now();
    const matrix = arrayToSquareMatrix(letterList.split(''));
    const prediction = await getTotalWordsPrediction(matrix, model);
    console.log('Took', convertMilliseconds(Date.now() - startTime), '-> Prediction for', letterList, prediction);
    res.status(400).json(prediction);
  } catch (error) {
    console.error('Error applying model:', error);
    res.status(500).send(`Error applying model: ${error}`);
  }
});

app.post(`${BASE_PATH}getBestPuzzle`, async (req, res) => {
  const { totalWordTarget, repetitions } = req.body;
  try {
    const startTime = Date.now();
    const { bestPuzzle, closest } = await getClosestPuzzleToTotal(totalWordTarget, repetitions);
    console.log(bestPuzzle, closest, '- closest to', totalWordTarget, '? Took', convertMilliseconds(Date.now() - startTime));
    res.status(400).json({
      best: bestPuzzle,
      totalWordPrediction: closest
    });
  } catch (error) {
    console.error('Error applying model:', error);
    res.status(500).send(`Error applying model: ${error}`);
  }
});

// const totalLimits = [
//   { "min": 50, "max": 100 },
//   { "min": 100, "max": 250 },
//   { "min": 250, "max": 400 },
//   { "min": 400, "max": 600 },
//   { "min": 600 },
// ];

// collect

app.post(`${BASE_PATH}collect`, async (req, res) => {
  const {
    attributes,
    compile = false,
    cores = 1,
    cycles,
    id,
    letterDistribution,
    maxAttempts = 1,
    multithreaded,
    push = false,
    qualityLimits,
    repetitions,
    research = false,
    saveAsTrainingData = false,
    size = 4,
  } = req.body;

  // Generate a unique job ID
  const jobId = id || 'collect';

  // Set up the cancellation flag
  ACTIVE_COLLECTION_JOBS[jobId] = { cancelled: false };

  const totalLimits = wordLimitsForSize[size];

  let mainFunc;

  if (!multithreaded) {
    mainFunc = getTopPuzzles;
  } else {
    mainFunc = getTopPuzzlesMultithreaded;
  }

  try {
    console.log('\n*******************************************************************************');
    console.log('\nCollecting', cycles, 'cycles of', repetitions, size, 'x', size, 'puzzles.');

    let lengthIndex = 0;
    let candidates = {};
    let totalNewEntries = {};
    let totalImproved = 0;

    const totalStart = Date.now();

    for (let i = 0; i < cycles; i++) {
      // Check if the job has been cancelled
      if (ACTIVE_COLLECTION_JOBS[jobId].cancelled) {
        console.log(`Job ${jobId} was cancelled at cycle ${i}`);
        break;
      }

      const currentLimits = qualityLimits || totalLimits[lengthIndex];
      console.log('\nCycle', i + 1, 'lengthIndex', lengthIndex, 'currentLimits', currentLimits);
      const startTime = Date.now();

      const { approvedEntries, trainingData, topCandidates, improvedCycleEntries } = await mainFunc(
        size,
        repetitions,
        attributes,
        cores,
        letterDistribution,
        maxAttempts,
        currentLimits
      );

      const quantity = trainingData.length;
      console.log('Cycle', i + 1, 'complete in', convertMilliseconds(Date.now() - startTime), ' - time per item ------>', convertMilliseconds((cores*repetitions*maxAttempts) / (Date.now() - startTime)));

      if (saveAsTrainingData) {
        const compressedData = minifyAndCompress(trainingData);
        const trainingDataDir = path.resolve(__dirname, `${trainingDataLocalPath}/training_data`);
        const filePath = path.join(trainingDataDir, `${size}_training_data-${repetitions}.gz`);
        fs.writeFileSync(filePath, compressedData);
        console.log(`Wrote new list locally.`);
      }

      if (push) {
        console.log(`\nPushing to GitHub...`);
        const gitCommand = `cd ${trainingDataDir} && git add . && git commit -m \"Update training data - ${quantity}\" && git push origin main`;
        const { stdout, stderr } = await execAsync(gitCommand);
        console.log('Git output:', stdout);
        if (stderr) {
          console.log('Git error output:', stderr);
        }
      }

      lengthIndex = (lengthIndex < (totalLimits.length - 1)) ? lengthIndex + 1 : 0;

      console.log(improvedCycleEntries, 'improvedCycleEntries from cycle', i);
      totalImproved += improvedCycleEntries;

      for (const attribute of attributes) {
        if (approvedEntries[attribute]) {
          totalNewEntries[attribute] = (totalNewEntries[attribute] || 0) + approvedEntries[attribute];
        }
        if (topCandidates[attribute]) {
          candidates[attribute] = {
            ...(candidates[attribute] || {}),
            ...topCandidates[attribute]
          };
        }
      }
    }

    console.log('All cycles done in', convertMilliseconds(Date.now() - totalStart))

    if (research) {
      for (const attribute of attributes) {
        await saveResearchFile(candidates[attribute], `topPerformers`, `top_${attribute}_${size}.json`);
      }
    }

    if (compile) {
      // let anyNewEntries = Object.values(totalNewEntries).some(count => count > 0);
      let anyNewEntries = Object.values(totalNewEntries).some(count => count > 0);
      if (anyNewEntries) {
        const totalPossibleEntries = repetitions * cycles;
        // const totalImproved = Object.keys(totalNewEntries).length;
        const percentage = Number(((totalImproved / totalPossibleEntries) * 100).toFixed(2));
        console.log('\nTotal new entries:', totalImproved, '/', totalPossibleEntries);
        console.log('Success rate @', maxAttempts, '-------->', percentage, '%');
        console.log('\nCompiling research/puzzle_stats.json...');
        await compileResearchFiles(`puzzle_stats.json`, size);
      } else {
        console.log('\n---------------------------------------------> No new puzzles for list :(');
      }
    }

    if (!ACTIVE_COLLECTION_JOBS[jobId].cancelled) {
      console.log(`Collection job ${jobId} completed successfully.`);
      res.status(200).json({
        message: `All ${cycles} cycles of repetitions finished.`
      });
    } else {
      res.status(200).json({
        message: `Cancelled!`
      });
    }

  } catch (error) {
    console.error('Error generating training data:', error);
    res.status(500).json({ error: error.message });
  } finally {
    // Clean up the job reference
    delete ACTIVE_COLLECTION_JOBS[jobId];
  }
});

// cancel

app.post(`${BASE_PATH}cancel/:jobId`, (req, res) => {
  const { jobId } = req.params;
  if (ACTIVE_COLLECTION_JOBS[jobId]) {
    ACTIVE_COLLECTION_JOBS[jobId].cancelled = true;
    res.json({ message: `Cancellation request for job ${jobId} received` });
  } else {
    res.status(404).json({ message: `Job ${jobId} not found or already completed` });
  }
});

// generate

app.post(`${BASE_PATH}generateBoggle`, async (req, res) => {
  if (!trie) {
    trie = await buildDictionary();
  }
  try {
    const options = req.body;
    const genStart = Date.now();
    const puzzleData = await generatePuzzleMultiThreaded(options, trie);
    const serverDuration = Date.now() - genStart;
    if (puzzleData.data) {
      res.json({
        success: true,
        message: `${puzzleData.message} (server took ${serverDuration}ms)`,
        data: puzzleData.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: `${puzzleData.message} (server took ${serverDuration}ms)`,
        data: { serverDuration }
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('Puzzle creation error: ' + error.message);
  }
});

//solve

app.post(`${BASE_PATH}solveBoggle/:userQueryString`, async (req, res) => {
  const { userQueryString } = req.params;
  if (!trie) {
    trie = await buildDictionary();
  }
  try {
    // const userQueryString = Object.keys(req.query)[0];
    const genStart = Date.now();
    console.log('solving', userQueryString);
    const solveResponse = await solveBoggle(userQueryString, trie);
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

app.get(`${BASE_PATH}checkPronounceability`, async (req, res) => {
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
 Server running on http://localhost:${port}${BASE_PATH}  |
                                          |
******************************************
`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`Port ${port} is in use, trying another port...`);
    const newPort = parseInt(port) + 1; // Increment the port number by 1
    app.listen(newPort, () => {
      console.log(`
******************************************
                                          |
 Server running on http://localhost:${newPort}${BASE_PATH}  |
                                          |
******************************************
`);
    });
  } else {
    console.error('Server error:', err);
  }
});;

console.log(``);


