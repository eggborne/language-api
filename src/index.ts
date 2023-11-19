import express from 'express';
import sequelize from './sequelize';

const app = express();
const port = 3000; // You can choose any port

app.get('/', (req, res) => {
  res.send('Hello Cocksuckers from Express and TypeScript!');
});

app.get('/check', async (req, res) => {
  res.send(`you sent ${req} to the API!`)
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Function to test the connection
const testDBConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

// Call the function to test the connection
testDBConnection();
