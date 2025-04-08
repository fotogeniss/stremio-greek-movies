const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

////////////////////////////////////////////////////////////////////////////////
// 1) Ορισμός του Manifest
////////////////////////////////////////////////////////////////////////////////
const manifest = {
  id: 'org.my.greekmovies',
  version: '1.0.0',
  name: 'Greek Movies Add-on',
  description: 'Παράδειγμα Add-on για ταινίες από το greek-movies.com/movies.php',
  logo: 'https://greek-movies.com/img/logo.png',
  catalogs: [
    {
      type: 'movie',
      id: 'all_greek_movies',
      name: 'Greek Movies (All)',
      // Δεν βάζουμε search extra, απλώς εμφανίζουμε τη λίστα όλων
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
// 2) Δημιουργία του Addon Builder
////////////////////////////////////////////////////////////////////////////////
const builder = new addonBuilder(manifest);

////////////////////////////////////////////////////////////////////////////////
// 3) Catalog Handler
//    Διαβάζει https://greek-movies.com/movies.php και επιστρέφει όλες τις ταινίες
////////////////////////////////////////////////////////////////////////////////
builder.defineCatalogHandler(async (args) => {
  const { id, type } = args;
  console.log('[CatalogHandler] Request:', args);

  // Ελέγχουμε αν ζητάει το σωστό catalog
  if (type === 'movie' && id === 'all_greek_movies') {
    const results = [];

    try {
      const url = 'https://greek-movies.com/movies.php';
      console.log('[CatalogHandler] Fetching:', url);

      // Κάνουμε GET στη σελίδα με axios
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      // === Προσοχή: Προσαρμόζεις τον selector
      //     π.χ. αν οι ταινίες βρίσκονται μέσα σε <div class="folder">
      //     ή <div class="col-md-2 col-sm-3 col-xs-4 folder"> κλπ.
      $('div.folder').each((i, elem) => {
        // link προς την υποσελίδα της ταινίας (relative ή absolute)
        const link = $(elem).find('a').attr('href') || '';
        // poster (src του <img>)
        const poster = $(elem).find('img').attr('src') || '';
        // τίτλος: ενίοτε είναι κείμενο μέσα στο <a>, οπότε:
        const title = $(elem).find('a').text().trim() || 'Χωρίς τίτλο';

        // Αν τα links είναι σχετικά π.χ. '/m/123', ίσως χρειαστεί να κάνεις:
        // const fullLink = 'https://greek-movies.com' + link;

        // Φτιάχνουμε ένα μοναδικό ID για το Stremio
        if (link) {
          // Προσέχουμε να μην έχει κενό link
          const movieId = 'greekmovies_' + link;

          // Προσθήκη στο array
          results.push({
            id: movieId,
            type: 'movie',
            name: title,
            poster: poster
          });
        }
      });

      console.log(`[CatalogHandler] Βρέθηκαν ${results.length} ταινίες`);
      return { metas: results };
    } catch (err) {
      console.error('[CatalogHandler] Σφάλμα στο axios.get:', err.message);
      // αν αποτύχει, γυρνάμε άδειο array
      return { metas: [] };
    }
  }

  // Αν δεν ταιριάζει το request, γύρνα άδειο
  return { metas: [] };
});

////////////////////////////////////////////////////////////////////////////////
// 4) Meta Handler
//    Όταν το Stremio ζητάει πληροφορίες για συγκεκριμένο ID (ταινία),
////////////////////////////////////////////////////////////////////////////////
builder.defineMetaHandler(async (args) => {
  const { type, id } = args;
  console.log('[MetaHandler] Request:', args);

  // Ελέγχουμε αν είναι 'movie' και αν ξεκινάει με 'greekmovies_'
  if (type === 'movie' && id.startsWith('greekmovies_')) {
    // Ανακτούμε το πραγματικό link (όπως το αποθηκεύσαμε)
    const realLink = id.replace('greekmovies_', '');
    // Αν το link είναι σχετικό, πρόσθεσε το domain μπροστά:
    // const fullLink = 'https://greek-movies.com' + realLink;

    try {
      console.log('[MetaHandler] Getting link:', realLink);
      const response = await axios.get(realLink);
      const html = response.data;
      const $ = cheerio.load(html);

      // === Προσαρμόζεις τους selectors με βάση τη σελίδα της συγκεκριμένης ταινίας
      // Παράδειγμα: ψάχνουμε <h1> για τίτλο, <img> για poster, κλπ.
      const title = $('h1').text().trim() || 'Χωρίς τίτλο';
      const poster = $('img.poster-class').attr('src') || '';
      const description = $('div.synopsis').text().trim() || '';

      const meta = {
        id,
        type: 'movie',
        name: title,
        poster,
        description
        // Μπορείς να βάλεις κι άλλα πεδία, π.χ. year, director, cast, κλπ.
      };

      return { meta };
    } catch (err) {
      console.error('[MetaHandler] Σφάλμα στο axios.get:', err.message);
      return { meta: {} };
    }
  }

  return { meta: {} };
});

////////////////////////////////////////////////////////////////////////////////
// 5) Stream Handler
//    Επιστρέφει τα βίντεο links (π.χ. iframe.src) για την ταινία
////////////////////////////////////////////////////////////////////////////////
builder.defineStreamHandler(async (args) => {
  const { type, id } = args;
  console.log('[StreamHandler] Request:', args);

  if (type === 'movie' && id.startsWith('greekmovies_')) {
    const realLink = id.replace('greekmovies_', '');
    // ή αν χρειάζεται domain:
    // const fullLink = 'https://greek-movies.com' + realLink;

    try {
      console.log('[StreamHandler] Getting link:', realLink);
      const response = await axios.get(realLink);
      const html = response.data;
      const $ = cheerio.load(html);

      // Παράδειγμα: ψάχνουμε <iframe> για το βίντεο
      const iframeSrc = $('iframe').attr('src') || '';

      const streams = [];
      if (iframeSrc) {
        // Ένα μόνο stream
        streams.push({
          name: 'Greek Movies Stream',
          title: 'Greek Movies Stream',
          url: iframeSrc,
          isFree: true
        });
      }
      return { streams };
    } catch (err) {
      console.error('[StreamHandler] Σφάλμα στο axios.get:', err.message);
      return { streams: [] };
    }
  }

  return { streams: [] };
});

////////////////////////////////////////////////////////////////////////////////
// 6) Στήνουμε το Express Server για το Add-on
////////////////////////////////////////////////////////////////////////////////
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

const app = express();
app.use('/', addonRouter);

// Χρησιμοποιούμε το PORT που δίνει η πλατφόρμα (Heroku/Render)
// ή 7000 αν δεν υπάρχει
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`✅ Greek Movies Addon running on http://localhost:${PORT}`);
  console.log(`   Manifest URL: http://localhost:${PORT}/manifest.json`);
});
