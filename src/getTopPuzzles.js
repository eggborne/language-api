const { Worker } = require('worker_threads');
const os = require('os');
const cliProgress = require('cli-progress');
const colors = require('colors');
const path = require('path');
const { averageOfValues, averageOfValue, buildDictionary } = require('./scripts/util');
const { getBestLists, addToBestList, addToObj1IfGreaterThanAverage, sendListToRemote } = require('./scripts/research');

let trie = false;

const getTopPuzzles = async (repetitions, attribute, cores, qualityLimits) => {
  const numCPUs = cores;
  const chunkSize = Math.min(Math.ceil(repetitions / numCPUs), 50000)
  console.log('CPUS:', numCPUs, 'chunkSize:', chunkSize);

  if (!trie) trie = await buildDictionary();

  let progressBar = new cliProgress.SingleBar({
    format: 'Top ' + attribute + ' progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Lists || ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  let completedTasks = 0;
  const workers = [];
  let trainingData = [];
  let aboveAverageLetterLists = {};

  const listFileName = attribute !== 'totalWords' ? `best-${attribute}-${qualityLimits.min}-${qualityLimits.max}.json` : `best-totalWords.json`;
  const currentList = await getBestLists(listFileName.replace(/percentUncommon/g, 'percentCommon'));
  let listAverage = averageOfValue(currentList, attribute, 5);
  let listLength = Object.entries(currentList).length;

  console.log(`Old average ${attribute} for ${listLength} puzzles ---> `, listAverage);

  const workerRepetitions = Math.ceil(repetitions / numCPUs);

  for (let i = 0; i < numCPUs; i++) {
    const workerStart = i * workerRepetitions;
    const workerEnd = Math.min(workerStart + workerRepetitions, repetitions);

    const worker = new Worker(path.resolve(__dirname, 'workers/topPuzzlesWorker.js'), {
      workerData: {
        attribute,
        qualityLimits,
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
  if (improvedAmount) {
    const improvedList = addToObj1IfGreaterThanAverage(currentList, aboveAverageLetterLists);
    if (Object.entries(improvedList).length > listLength) {
      let destFileName = attribute !== 'totalWords' ? `best-${attribute}-${qualityLimits.min}-${qualityLimits.max}.json` : `best-totalWords.json`;
      destFileName = destFileName.replace(/percentUncommon/g, 'percentCommon');
      await addToBestList(improvedList, destFileName, true);
      const approvedEntries = Object.entries(improvedList).length - listLength;
      await sendListToRemote(destFileName);
      const successRate = (approvedEntries / repetitions) * 100;
      console.log('Added from', repetitions, 'total:', (approvedEntries), '/', improvedAmount, '(initially) above-average entries. Success rate ------>', successRate)
    } else {
      console.log('No acceptable new entries.');
    }
  }

  return trainingData;
};

module.exports = { getTopPuzzles };