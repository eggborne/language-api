const { getRandomCubes } = require("../scripts/research");
const { arrayToSquareMatrix } = require("../scripts/util");

const getTotalWordsPrediction =  async (inputData) => {
  try {
    const response = await fetch('http://127.0.0.1:5000/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: inputData })
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    let data = await response.json();
    data = JSON.parse(data);
    return Number(data.toFixed(1));
  } catch (error) {
    console.error('Error:', error);
  }
}

const getClosestPuzzleToTotal = async (totalWordTarget, repetitions) => {
  let bestPuzzle;
  let closestOffBy = 9999;
  for (let i = 0; i < repetitions; i++) {
    const { letterList } = getRandomCubes('boggle');
    const matrix = arrayToSquareMatrix(letterList);
    const prediction = await getTotalWordsPrediction(matrix);
    const offBy = Math.abs(totalWordTarget - prediction);
    if (offBy < closestOffBy) {
      closestOffBy = offBy;
      bestPuzzle = letterList.flat().join('');
      console.log(prediction, 'best so far!')
    } else {
      console.log(prediction, 'no good')
    }
  }
  return { bestPuzzle, closestOffBy };
}

module.exports = { getClosestPuzzleToTotal, getTotalWordsPrediction };