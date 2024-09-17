const { parentPort, workerData } = require('worker_threads');
const { generatePuzzle } = require('../services/boggleService');

parentPort.on('message', async (message) => {
  if (message.type === 'generate') {
    const result = await generatePuzzle(workerData.options, workerData.trie, (progress) => {
      parentPort.postMessage({ type: 'progress', data: progress });
    }, workerData.loopNumber);
    parentPort.postMessage({ type: 'result', data: result });
  }
});