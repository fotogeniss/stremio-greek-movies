const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

const manifest = {
  id: 'org.my.greekmovies',
  version: '1.0.0',
  name: 'Greek Movies (movies.php) Add-on',
  description: 'Παράδειγμα add-on που διαβάζει από το greek-movies.com/movies.php',
  logo: 'https://greek-movies.com/img/logo.png',
  catalogs: [
    {
      type: 'movie',
      id: 'all_greek_movies',
      name: 'Greek Movies List',
      // Αν θες απλώς λίστα χωρίς search, δεν χρειάζεται [{ name: 'search' }]
    }
  ],
  resources: [
    'catalog',
    'meta',
    'stream'
  ],
  types: ['movie'],
  idPrefixes: ['greekmovies_']
};

const builder = new addonBuilder(manifest);

// 1) Catalog που διαβάζει ΑΠΛΑ όλα τα movies από το movies.php (χωρίς search)
builder.defineCatalogHandler(async (args) => {
  const { type, id } = args;
  console.log('[CatalogHandler] Request:', args);

  // Σιγουρευόμαστε ότι ζητάει movie & το δικό μας catalog ID
  if (type === 'movie' && id === 'all_greek_movies') {
    const results = [];

    try {
      const url = 'https://greek-movies.com/movies.php';
      console.log('[CatalogHandler] Fetching:', url);
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      // Τώρα προσαρμόζεις το selector με βάση το πώς εμφανίζονται τα στοιχεία
      $('div.movie-item').each((i, elem) => {
        const title = $(elem).find('.title').text().trim() || 'Χωρίς τίτλο';
        const link = $(elem).find('a').attr('href') || '';
        const poster = $(elem).find('img').attr('src') || '';

        // Φτιάχνουμε ένα ID που ξεκινά με 'greekmovies_'
        if (link) {
          const movieId = 'greekmovies_' + link;
          results.push({
            id: movieId,
            type: 'movie',
            name: title,
            poster: poster
          });
        }
      });

      console.log('[CatalogHandler] Βρέθηκαν:', results.length, 'ταινίες');
      return { metas: results };
    } catch (err) {
      console.error('[CatalogHandler] Σφάλμα:', err.message);
      // Αν αποτύχει το scraping, γυρνάμε άδειο
      return { metas: [] };
    }
  }

  // Default empty
  return { metas: [] };
});

// 2) Meta Handler
builder.defineMetaHandler(async (args) => {
  const { type, id } = args;
  console.log('[MetaHandler] Request:', args);

  if (type === 'movie' && id.startsWith('greekmovies_')) {
    const realLink = id.replace('greekmovies_', '');
    console.log('[MetaHandler] Real link is:', realLink);

    try {
      const response = await axios.get(realLink);
      const html = response.data;
      const $ = cheerio.load(html);

      // Παράδειγμα, βρίσκουμε τον τίτλο, πόστερ και περιγραφή
      const title = $('h1').text().trim() || 'Χωρίς τίτλο';
      const poster = $('img.poster-class').attr('src') || '';
      const description = $('div.synopsis').text().trim() || '';

      const meta = {
        id,
        type: 'movie',
        name: title,
        poster,
        description
      };

      return { meta };
    } catch (err) {
      console.error('[MetaHandler] Σφάλμα:', err.message);
      return { meta: {} };
    }
  }

  return { meta: {} };
});

// 3) Stream Handler
builder.defineStreamHandler(async (args) => {
  const { type, id } = args;
  console.log('[StreamHandler] Request:', args);

  if (type === 'movie' && id.startsWith('greekmovies_')) {
    const realLink = id.replace('greekmovies_', '');
    console.log('[StreamHandler] Real link is:', realLink);

    try {
      const response = await axios.get(realLink);
      const html = response.data;
      const $ = cheerio.load(html);

      // Παράδειγμα, βρίσκεις iframe
      const iframeSrc = $('iframe').attr('src') || '';

      const streams = [];
      if (iframeSrc) {
        streams.push({
          name: 'Greek Movies Stream',
          title: 'Greek Movies Stream',
          url: iframeSrc,
          isFree: true
        });
      }
      return { streams };
    } catch (err) {
      console.error('[StreamHandler] Σφάλμα:', err.message);
      return { streams: [] };
    }
  }

  return { streams: [] };
});

// 4) Express Server
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

const app = express();
app.use('/', addonRouter);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`✅ Greek Movies Addon running on http://localhost:${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
});
