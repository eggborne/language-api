const { Worker } = require('worker_threads');
const os = require('os');
const cliProgress = require('cli-progress');
const colors = require('colors');
const path = require('path');
const { averageOfValues } = require('./scripts/util');
const { getBestLists, addToBestList, addToObj1IfGreaterThanAverage } = require('./scripts/research');
const { buildDictionary } = require('./services/boggleService');

const numCPUs = os.cpus().length;

let trie = false;

const collectTrainingData = async (repetitions) => {
  console.log('CPUS:', numCPUs);

  if (!trie) {
    trie = await buildDictionary();
  }

  let progressBar = new cliProgress.SingleBar({
    format: 'Collection progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Lists || ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  let completedTasks = 0;
  const workers = [];
  let trainingData = [];
  let aboveAverageLetterLists = {};

  const currentList = await getBestLists();
  let listAverage = averageOfValues(currentList, 5);

  console.log(`\nOLD AVERAGE for ${Object.values(currentList).length} puzzles ---> `, listAverage);

  progressBar.start(repetitions, 0); // Set the total to `repetitions`

  // Calculate how many repetitions each worker should handle
  const workerRepetitions = Math.ceil(repetitions / numCPUs);

  for (let i = 0; i < numCPUs; i++) {
    const workerStart = i * workerRepetitions;
    const workerEnd = Math.min(workerStart + workerRepetitions, repetitions);

    const worker = new Worker(path.resolve(__dirname, 'workers/trainingDataWorker.js'), {
      workerData: {
        start: workerStart,
        end: workerEnd,
        listAverage,
        trie,
        chunkSize: 100000, // Limit the chunkSize within the worker
      }
    });

    worker.on('message', ({ type, data }) => {
      if (type === 'progress') {
        completedTasks += 1;  // Increment by 1 for each progress message
        progressBar.update(completedTasks);
      } else if (type === 'result') {
        trainingData = trainingData.concat(data.trainingData);
        aboveAverageLetterLists = {
          ...aboveAverageLetterLists,
          ...data.saveableLetterLists
        };
      }
    });

    worker.on('error', (error) => {
      console.error(`Worker ${i + 1} error:`, error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${i + 1} stopped with exit code ${code}`);
      }
    });
    console.log(`Created worker ${i + 1}`);
    workers.push(worker);
  }

  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    })));
  } catch (error) {
    console.error('Error in worker execution:', error);
  }

  progressBar.stop();
  console.log(`Collected data for ${trainingData.length} puzzles.`);
  console.log(`Collected ${Object.keys(aboveAverageLetterLists).length} above-average letter lists.`);
  const improvedList = addToObj1IfGreaterThanAverage(currentList, aboveAverageLetterLists);
  await addToBestList(improvedList, true);

  return trainingData;
};

module.exports = { collectTrainingData };