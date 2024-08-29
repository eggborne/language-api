const { Worker } = require('worker_threads');
const os = require('os');
const cliProgress = require('cli-progress');
const colors = require('colors');
const path = require('path');
const { averageOfValues, convertMilliseconds, getHigherScores, buildDictionary } = require('./scripts/util');
const { getBestLists, addToBestList } = require('./scripts/research');

const numCPUs = os.cpus().length;

let trie = false;

const pruneLetterListCollection = async (listObj, attempts) => {
  console.log('CPUS:', numCPUs);

  if (!trie) {
    trie = await buildDictionary();
  }

  const letterLists = Object.keys(listObj);
  const startTime = Date.now();

  const progressBar = new cliProgress.SingleBar({
    format: 'Pruning progress |' + colors.cyan('{bar}') + `| {percentage}% || {value}/{total} Lists x ${attempts} || ETA: {eta}s`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  progressBar.start(letterLists.length, 0);

  const chunkSize = Math.ceil(letterLists.length / numCPUs);
  const workers = [];
  const listScores = {};
  let completedTasks = 0;

  for (let i = 0; i < numCPUs; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, letterLists.length);
    const worker = new Worker(path.resolve(__dirname, 'workers/pruneWorker.js'), {
      workerData: {
        attempts,
        letterLists: letterLists.slice(start, end),
        startIndex: start,
        trie
      }
    });

    worker.on('message', ({ index, scores }) => {
      Object.assign(listScores, scores);
      completedTasks++;
      progressBar.update(completedTasks);
    });

    workers.push(worker);
  }

  await Promise.all(workers.map(worker => new Promise(resolve => worker.on('exit', resolve))));

  progressBar.stop();

  const totalTime = Date.now() - startTime;
  const oldList = await getBestLists('best-totalWords.json');

  const prunedList = getHigherScores(oldList, listScores);
  const totalAverage = averageOfValues(prunedList);

  addToBestList(prunedList, 'best-totalWords.json', true);
  console.log(`Total processing time: ${convertMilliseconds(totalTime)}`);
  console.log(`Average time per item: ${convertMilliseconds(totalTime / (letterLists.length * attempts))}`);

  return { prunedList, totalAverage };
};

module.exports = { pruneLetterListCollection };