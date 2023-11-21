import express from 'express';
import path from 'path';
import webpack, { Configuration } from 'webpack';
import webpackDevMiddleware from 'webpack-dev-middleware';
import webpackHotMiddleware from 'webpack-hot-middleware';
// @ts-ignore
import webpackConfig from '../webpack.config';
import sequelize from './sequelize';
import Word from './models/word';

const app = express();
const port = 3000;

const compiler = webpack(webpackConfig as Configuration);
app.use(webpackDevMiddleware(compiler, {
  publicPath: webpackConfig.output.publicPath
}));

app.use(webpackHotMiddleware(compiler));


app.get('/check', async (req, res) => {
  try {
    const wordToCheck = req.query.word;
    if (!wordToCheck) {
      return res.status(400).send('No word specified');
    }

    const wordExists = await Word.findOne({ where: { word: wordToCheck } });
    return res.json({ exists: !!wordExists });
  } catch (error) {
    console.error(error);
    return res.status(500).send('Error occurred while checking the word');
  }
});

app.use(express.static(path.join(__dirname, '../public')));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

const testDBConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

// testDBConnection();
