require('dotenv').config();

const app = require('./src/app');
const env = require('./src/config/env');

app.listen(env.PORT, () => {
  console.log(`4TEEN wallet API listening on port ${env.PORT}`);
});
