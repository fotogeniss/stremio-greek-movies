const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

/******************************************************************************
 * 1) ΟΡΙΣΜΟΣ ΤΟΥ MANIFEST
 *    - Προσέχουμε το ID 'greek-movies' (σύμφωνα με τα logs)
 *****************************************************************************/
const manifest = {
  id: 'org.my.greekmovies',
  version: '1.0.0',
  name: 'Greek Movies Add-on',
  description: 'Προσαρμοσμένο Stremio Add-on (debug version)',
  logo: 'https://greek-movies.com/img/logo.png',
  catalogs: [
    {
      type: 'movie',
      id: 'greek-movies', // Εδώ προσέχουμε να ταιριάζει με τα logs
      name: 'All Greek Movies'
      // extra: [{ name: 'search' }] αν θες αναζήτηση
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

/******************************************************************************
 * 2) ΔΗΜΙΟΥΡΓΙΑ ADDON BUILDER
 *****************************************************************************/
const builder = new addonBuilder(manifest);

/******************************************************************************
 * 3) CATALOG HANDLER
 *    Με εκτεταμένο debug logging
 *****************************************************************************/
builder.defineCatalogHandler(async (args) => {
  console.log('[CatalogHandler] Request:', args);
  const { type, id } = args;

  // Ελέγχουμε: type=movie, id='greek-movies'
  if (type === 'movie' && id === 'greek-movies') {
    const results = [];

    // URL για scraping. Αν στο τέλος θες /movies.php, βαλ' το.
    const url = 'https://greek-movies.com/movies.php';

    try {
      console.log(`[CatalogHandler] Scraping URL: ${url}`);
      const response = await axios.get(url);

      // Εμφανίζουμε το status code
      console.log(`[CatalogHandler] HTTP status: ${response.status}`);

      // Τυπώνουμε τα πρώτα 500 bytes του HTML για να δούμε αν είναι σωστό:
      const rawHtml = response.data;
      console.log('[CatalogHandler] First 500 chars of HTML:', rawHtml.slice(0, 500));

      // Κάνουμε load στο cheerio
      const $ = cheerio.load(rawHtml);

      // === ΠΡΟΣΑΡΜΟΣΕ ΤΟΥΣ SELECTORS ===
      // Π.χ. αν είναι div.folder ή div.col-md-2.col-sm-3.col-xs-4.folder κ.λπ.
      $('div.folder').each((i, elem) => {
        // Παράδειγμα:
        const link = $(elem).find('a').attr('href') || '';
        const poster = $(elem).find('img').attr('src') || '';
        // Κείμενο τίτλου
        const titleText = $(elem).find('a').text().trim() || 'Χωρίς τίτλο';

        // Αν έχεις relative link, π.χ. /m/123, θες:
        // const fullLink = 'https://greek-movies.com' + link;
        // Εδώ φτιάχνουμε το ID
        const movieId = 'greekmovies_' + link;

        // Προσθέτουμε στο results
        results.push({
          id: movieId,
          type: 'movie',
          name: titleText,
          poster: poster
        });
      });

      console.log(`[CatalogHandler] Βρέθηκαν: ${results.length} στοιχεία`);
      return { metas: results };

    } catch (err) {
      // Αν έχουμε λάθος (403, DNS κ.λπ.), το τυπώνουμε
      console.error('[CatalogHandler] Σφάλμα στο axios.get:', err.message);
      return { metas: [] };
    }
  }

  // Αν δεν ταιριάζει το αίτημα, γυρνάμε άδειο
  return { metas: [] };
});

/******************************************************************************
 * 4) META HANDLER (ενδεικτικό)
 *****************************************************************************/
builder.defineMetaHandler(async (args) => {
  console.log('[MetaHandler] Request:', args);
  const { type, id } = args;

  if (type === 'movie' && id.startsWith('greekmovies_')) {
    // Αφαιρούμε το prefix
    const realLink = id.replace('greekmovies_', '');
    console.log('[MetaHandler] realLink:', realLink);

    // Αν είναι relative, πρόσθεσε domain
    let fullLink = realLink;
    if (!realLink.startsWith('http')) {
      fullLink = 'https://greek-movies.com' + realLink;
    }

    try {
      const response = await axios.get(fullLink);
      console.log('[MetaHandler] Status:', response.status);

      const html = response.data;
      const $ = cheerio.load(html);

      // Παράδειγμα selectors:
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

/******************************************************************************
 * 5) STREAM HANDLER (ενδεικτικό)
 *****************************************************************************/
builder.defineStreamHandler(async (args) => {
  console.log('[StreamHandler] Request:', args);
  const { type, id } = args;

  if (type === 'movie' && id.startsWith('greekmovies_')) {
    const realLink = id.replace('greekmovies_', '');
    let fullLink = realLink;
    if (!realLink.startsWith('http')) {
      fullLink = 'https://greek-movies.com' + realLink;
    }

    try {
      console.log('[StreamHandler] Fetching:', fullLink);
      const response = await axios.get(fullLink);
      const html = response.data;
      const $ = cheerio.load(html);

      // Παράδειγμα: Βρίσκουμε κάποιο iframe ή κουμπιά 'προβολή σε ...'
      const streams = [];

      // 1) Πιάνουμε το πρώτο iframe
      const iframeSrc = $('iframe').attr('src') || '';
      if (iframeSrc) {
        streams.push({
          name: 'Embedded Iframe',
          title: 'Embedded Iframe',
          url: iframeSrc,
          isFree: true
        });
      }

      console.log(`[StreamHandler] Βρέθηκαν ${streams.length} streams`);
      return { streams };
    } catch (err) {
      console.error('[StreamHandler] Σφάλμα:', err.message);
      return { streams: [] };
    }
  }

  return { streams: [] };
});

/******************************************************************************
 * 6) EXPRESS SERVER
 *****************************************************************************/
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

const app = express();
app.use('/', addonRouter);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`✅ Greek Movies Addon listening on http://localhost:${PORT}`);
  console.log(`   Manifest: http://localhost:${PORT}/manifest.json`);
});
