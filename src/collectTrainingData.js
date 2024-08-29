const { Worker } = require('worker_threads');
const os = require('os');
const cliProgress = require('cli-progress');
const colors = require('colors');
const path = require('path');
const { averageOfValues, buildDictionary } = require('./scripts/util');
const { getBestLists, addToBestList, addToObj1IfGreaterThanAverage, sendListToRemote } = require('./scripts/research');

const numCPUs = os.cpus().length;
// const numCPUs = 4;

let trie = false;

const collectTrainingData = async (repetitions) => {
  const chunkSize = Math.min(Math.ceil(repetitions / numCPUs), 1000)
  console.log('CPUS:', numCPUs);
  console.log('chunkSize:', chunkSize);

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

  const currentList = await getBestLists('best-totalWords.json');
  let listAverage = averageOfValues(currentList, 5);
  let listLength = Object.entries(currentList).length;

  console.log(`Old average for ${Object.values(currentList).length} puzzles ---> `, listAverage);

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
        chunkSize,
      }
    });

    worker.on('message', ({ type, data }) => {
      if (type === 'progress') {
        completedTasks += 1;
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
    workers.push(worker);
    process.stdout.write(`Created worker ${workers.length}...\r`);
  }

  progressBar.start(repetitions, 0);

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
  const improvedAmount = Object.keys(aboveAverageLetterLists).length;
  console.log('------> above-initial-average letter lists collected:', improvedAmount);
  if (improvedAmount) {
    const improvedList = addToObj1IfGreaterThanAverage(currentList, aboveAverageLetterLists);
    if (Object.entries(improvedList).length > listLength) {
      await addToBestList(improvedList, 'best-totalWords.json', true);
      await sendListToRemote(improvedList, 'best-totalWords.json');
      console.log('Added', (Object.entries(improvedList).length - listLength), 'above-average entries.')
    } else {
      console.log('No acceptable new entries.')
    }
  }

  return trainingData;
};

module.exports = { collectTrainingData };