import express from 'express';
import cors from 'cors';
import Gun from 'gun';

const app = express();
const port = process.env.PORT || 8765;

// Frontend en relay draaien op verschillende domeinen (bv. Netlify + Render),
// dus de browser heeft CORS-headers nodig voor Gun's niet-WebSocket verkeer.
app.use(cors());

// Veel hosting-platformen (waaronder Render) controleren of de service op
// een pad antwoordt om te weten of ze "live" is.
app.get('/', (req, res) => {
  res.send('Gun relay is actief.');
});

const server = app.listen(port, () => {
  const url = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/gun`
    : `http://localhost:${port}/gun`;
  console.log(`Gun relay draait op ${url}`);
});

// DATA_DIR laat toe om op een platform met persistent disk (zie README,
// sectie Render) naar het gemounte pad te wijzen. Lokaal valt dit terug
// op de map "data" naast dit bestand.
const dataDir = process.env.DATA_DIR || 'data';

Gun({ web: server, file: dataDir });
