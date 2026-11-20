import express from 'express';
import Gun from 'gun';

const app = express();
const port = process.env.PORT || 8765;

const server = app.listen(port, () => {
  console.log(`Gun relay draait op http://localhost:${port}/gun`);
});

// 'file' zorgt dat data persistent op schijf wordt opgeslagen (map "data/")
Gun({ web: server, file: 'data' });
