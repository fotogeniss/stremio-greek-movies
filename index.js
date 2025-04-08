const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

////////////////////////////////////////////////////////////////////////////////
// 1) MANIFEST
////////////////////////////////////////////////////////////////////////////////
const manifest = {
  id: 'org.my.greekmovies',
  version: '1.0.0',
  name: 'Greek Movies Add-on',
  description: 'Αναζητά ταινίες από το greek-movies.com και παρέχει streams',
  logo: 'https://greek-movies.com/img/logo.png', // ή κάποιο δικό σου
  catalogs: [
    {
      type: 'movie',
      id: 'greekmovies_catalog',
      name: 'Greek Movies',
      extra: [{ name: 'search' }]
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

////////////////////////////////////////////////////////////////////////////////
// 2) ΔΗΜΙΟΥΡΓΙΑ ADDON BUILDER
////////////////////////////////////////////////////////////////////////////////
const builder = new addonBuilder(manifest);

////////////////////////////////////////////////////////////////////////////////
// 3) CATALOG HANDLER
////////////////////////////////////////////////////////////////////////////////
builder.defineCatalogHandler(async (args) => {
  const { id, type, extra } = args;
  const results = [];

  console.log('[CatalogHandler] Incoming request:', args);

  // Μόνο αν είναι type=movie και id=greekmovies_catalog
  if (type === 'movie' && id === 'greekmovies_catalog') {
    const searchQuery = extra.search;
    if (searchQuery) {
      // Φτιάχνουμε το URL αναζήτησης
      const searchUrl = `https://greek-movies.com/search?q=${encodeURIComponent(searchQuery)}`;
      console.log(`[CatalogHandler] Αναζήτηση για: "${searchQuery}" -> ${searchUrl}`);

      try {
        const response = await axios.get(searchUrl);
        const html = response.data;
        const $ = cheerio.load(html);

        // Προσαρμόζεις τους selectors ανάλογα με την ιστοσελίδα
        $('.movie-item').each((i, elem) => {
          const title = $(elem).find('.title').text().trim() || 'Χωρίς τίτλο';
          const link = $(elem).find('a').attr('href') || '';
          const poster = $(elem).find('img').attr('src') || '';

          // Δες τι επιστρέφει για debug
          console.log(`[CatalogHandler] Found: title="${title}", link="${link}"`);

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

      } catch (err) {
        // Αν κάτι πάει στραβά (π.χ. 403, 404, network error), το logάρουμε.
        console.error('[CatalogHandler] Σφάλμα στο axios.get(searchUrl):', err.message);
      }
    }
  }

  // Επιστρέφουμε το array με metas
  return {
    metas: results
  };
});

////////////////////////////////////////////////////////////////////////////////
// 4) META HANDLER
////////////////////////////////////////////////////////////////////////////////
builder.defineMetaHandler(async (args) => {
  const { type, id } = args;
  console.log('[MetaHandler] Incoming request:', args);

  // Ελέγχουμε αν το ID ξεκινά με 'greekmovies_'
  if (type === 'movie' && id.startsWith('greekmovies_')) {
    const realLink = id.replace('greekmovies_', '');
    console.log('[MetaHandler] Real link is:', realLink);

    try {
      const response = await axios.get(realLink);
      const html = response.data;
      const $ = cheerio.load(html);

      // Προσαρμόζεις τους selectors
      const title = $('h1').text().trim() || 'Χωρίς τίτλο';
      const poster = $('img.poster-class').attr('src') || '';
      const description = $('div.synopsis').text().trim() || '';

      console.log(`[MetaHandler] Fetched title="${title}"`);

      const meta = {
        id,
        type: 'movie',
        name: title,
        poster,
        description
        // Μπορείς να προσθέσεις κι άλλα πεδία (director, cast, releaseInfo κλπ.)
      };

      return { meta };
    } catch (err) {
      console.error('[MetaHandler] Σφάλμα στο axios.get(realLink):', err.message);
      return { meta: {} };
    }
  }

  // Αν δεν ταιριάζει στο πρότυπο, γυρίζουμε κενό
  return { meta: {} };
});

////////////////////////////////////////////////////////////////////////////////
// 5) STREAM HANDLER
////////////////////////////////////////////////////////////////////////////////
builder.defineStreamHandler(async (args) => {
  const { type, id } = args;
  console.log('[StreamHandler] Incoming request:', args);

  if (type === 'movie' && id.startsWith('greekmovies_')) {
    const realLink = id.replace('greekmovies_', '');
    console.log('[StreamHandler] Real link is:', realLink);

    try {
      const response = await axios.get(realLink);
      const html = response.data;
      const $ = cheerio.load(html);

      // Βρες το iframe ή το video src
      const iframeSrc = $('iframe').attr('src') || '';

      console.log(`[StreamHandler] iframeSrc = "${iframeSrc}"`);

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
      console.error('[StreamHandler] Σφάλμα στο axios.get(realLink):', err.message);
      return { streams: [] };
    }
  }

  return { streams: [] };
});

////////////////////////////////////////////////////////////////////////////////
// 6) ΣΤΗΝΟΥΜΕ ΤΟ ADDON ΣΕ EXPRESS SERVER
////////////////////////////////////////////////////////////////////////////////
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

const app = express();
app.use('/', addonRouter);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`✅ Greek Movies Addon running on http://localhost:${PORT}`);
});
