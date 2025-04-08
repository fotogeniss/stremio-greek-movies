const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

/******************************************************************************
 * 1) ΟΡΙΣΜΟΣ ΤΟΥ MANIFEST
 *    - Προσέχουμε το ID 'greek-movies' που είδαμε στα logs
 *****************************************************************************/
const manifest = {
  id: 'org.my.greekmovies',
  version: '1.0.0',
  name: 'Greek Movies Add-on',
  description: 'Παράδειγμα Add-on για ταινίες από το greek-movies.com',
  logo: 'https://greek-movies.com/img/logo.png',
  catalogs: [
    {
      type: 'movie',
      id: 'greek-movies', // <<-- Αυτό ταιριάζει με το id που βλέπουμε στα logs
      name: 'All Greek Movies'
      // extra: [{ name: 'search' }] // αν θέλεις και δυνατότητα αναζήτησης
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
 *    - Κάνει scraping στο movies.php (ή όπου θέλεις)
 *    - Προσθέσαμε debug logs για να δεις τι ακριβώς συμβαίνει
 *****************************************************************************/
builder.defineCatalogHandler(async (args) => {
  console.log('\n[CatalogHandler] Request:', args);

  const { type, id, extra } = args;

  // Ελέγχουμε αν ταιριάζει το type & id με αυτά του manifest
  if (type === 'movie' && id === 'greek-movies') {
    console.log('[CatalogHandler] => Ξεκινάμε Scraping...');
    const results = [];

    try {
      // Παράδειγμα: θα χτυπήσουμε αυτό το URL
      const url = 'https://greek-movies.com/movies.php';
      console.log('[CatalogHandler] Θα κάνω axios.get:', url);

      const response = await axios.get(url);
      console.log('[CatalogHandler] Status code:', response.status);

      // Δείχνουμε λίγο από το HTML (αν δεν είναι τεράστιο)
      console.log('[CatalogHandler] HTML snippet:', response.data.slice(0, 200));

      const html = response.data;
      const $ = cheerio.load(html);

      // Προσαρμόζεις τον selector σε αυτό που ταιριάζει στο site
      $('div.folder').each((i, elem) => {
        // Παράδειγμα: βρίσκουμε το link, poster, τίτλο
        const link = $(elem).find('a').attr('href') || '';
        const poster = $(elem).find('img').attr('src') || '';
        const title = $(elem).find('a').text().trim() || 'Χωρίς τίτλο';

        // Αν το link είναι σχετικό, π.χ. "/m/123", πρόσθεσε το domain μπροστά
        // const fullLink = 'https://greek-movies.com' + link;

        if (link) {
          // Φτιάχνουμε ένα μοναδικό ID (για το Stremio)
          const movieId = 'greekmovies_' + link;

          results.push({
            id: movieId,
            type: 'movie',
            name: title,
            poster
          });
        }
      });

      console.log('[CatalogHandler] Βρέθηκαν:', results.length, 'στοιχεία');

      // ΕΠΙΣΤΡΕΦΟΥΜΕ ΤΗ ΛΙΣΤΑ
      return { metas: results };

    } catch (err) {
      console.error('[CatalogHandler] Σφάλμα στο scraping:', err.message);
      // Αν αποτύχει το scraping, γυρνάμε κενή λίστα
      return { metas: [] };
    }
  }

  // Αν δεν ταιριάζει, γυρνάμε κενό
  console.log('[CatalogHandler] => Δεν είναι το δικό μας catalog, επιστρέφουμε κενό');
  return { metas: [] };
});

/******************************************************************************
 * 4) META HANDLER
 *    - Δείχνει λεπτομέρειες για μια ταινία (π.χ. τίτλος, περιγραφή)
 *****************************************************************************/
builder.defineMetaHandler(async (args) => {
  console.log('\n[MetaHandler] Request:', args);

  const { type, id } = args;
  if (type === 'movie' && id.startsWith('greekmovies_')) {
    // Αποκόβουμε το prefix
    let realLink = id.replace('greekmovies_', '');

    // Αν χρειάζεται προσθήκη domain:
    if (!realLink.startsWith('http')) {
      realLink = 'https://greek-movies.com' + realLink;
    }

    console.log('[MetaHandler] Full link:', realLink);

    try {
      const response = await axios.get(realLink);
      console.log('[MetaHandler] Status code:', response.status);

      const html = response.data;
      const $ = cheerio.load(html);

      // Παράδειγμα: βρίσκουμε <h1> ως τίτλο, <img> πόστερ, <div class="synopsis"> περιγραφή
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

  // Αν δεν ταιριάζει, γυρίζουμε κενό
  return { meta: {} };
});

/******************************************************************************
 * 5) STREAM HANDLER
 *    - Επιστρέφει τα video links / iframes
 *****************************************************************************/
builder.defineStreamHandler(async (args) => {
  console.log('\n[StreamHandler] Request:', args);

  const { type, id } = args;
  if (type === 'movie' && id.startsWith('greekmovies_')) {
    let realLink = id.replace('greekmovies_', '');
    if (!realLink.startsWith('http')) {
      realLink = 'https://greek-movies.com' + realLink;
    }

    try {
      console.log('[StreamHandler] Full link:', realLink);
      const response = await axios.get(realLink);
      console.log('[StreamHandler] Status code:', response.status);

      const html = response.data;
      const $ = cheerio.load(html);

      // Π.χ. βρίσκουμε ένα iframe
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

      console.log('[StreamHandler] Found streams:', streams.length);
      return { streams };
    } catch (err) {
      console.error('[StreamHandler] Σφάλμα:', err.message);
      return { streams: [] };
    }
  }

  return { streams: [] };
});

/******************************************************************************
 * 6) ΣΤΗΣΙΜΟ EXPRESS SERVER
 *****************************************************************************/
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

const app = express();
app.use('/', addonRouter);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`\n✅ Greek Movies Addon running on http://localhost:${PORT}`);
  console.log(`   Manifest URL: http://localhost:${PORT}/manifest.json`);
});
