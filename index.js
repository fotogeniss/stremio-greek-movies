 
const express = require("express");
const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 7000;

const manifest = {
    id: "org.greekmovies.addon",
    version: "1.0.0",
    name: "Greek Movies",
    description: "Δες ελληνικές ταινίες από το greek-movies.com",
    types: ["movie"],
    catalogs: [{
        type: "movie",
        id: "greek-movies",
        name: "Greek Movies",
        extra: [{ name: "search" }]
    }],
    resources: ["catalog", "stream", "meta"],
    idPrefixes: ["greekm:"]
};

const builder = new addonBuilder(manifest);

// STREAM
builder.defineStreamHandler(async ({ id }) => {
    if (!id.startsWith("greekm:")) return { streams: [] };
    const slug = id.replace("greekm:", "");
    const url = `https://greek-movies.com/${slug}`;

    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);
        const iframe = $('iframe[src*="ok.ru"], iframe[src*="youtube"]').first();
        const streamUrl = iframe.attr("src");

        if (!streamUrl) return { streams: [] };

        return {
            streams: [{
                title: "Greek Movies Stream",
                url: streamUrl
            }]
        };
    } catch (err) {
        return { streams: [] };
    }
});

// META
builder.defineMetaHandler(async ({ id }) => {
    const slug = id.replace("greekm:", "");
    const url = `https://greek-movies.com/${slug}`;

    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);
        const title = $(".title a").first().text().trim();
        const poster = $("img[src*='/posters']").first().attr("src");

        return {
            meta: {
                id,
                type: "movie",
                name: title || slug,
                poster: poster ? `https://greek-movies.com${poster}` : null,
                description: "Ελληνική ταινία από το greek-movies.com"
            }
        };
    } catch (err) {
        return { meta: null };
    }
});

// CATALOG + SEARCH
builder.defineCatalogHandler(async ({ extra }) => {
    const url = "https://greek-movies.com/movies.php";
    const metas = [];

    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        $(".poster a").slice(0, 30).each((i, el) => {
            const href = $(el).attr("href");
            const title = $(el).attr("title");
            const img = $(el).find("img").attr("src");

            if (href && title) {
                metas.push({
                    id: "greekm:" + href,
                    type: "movie",
                    name: title,
                    poster: img ? `https://greek-movies.com${img}` : null
                });
            }
        });

        if (extra?.search) {
            const q = extra.search.toLowerCase();
            return { metas: metas.filter(m => m.name.toLowerCase().includes(q)) };
        }

        return { metas };
    } catch (err) {
        return { metas: [] };
    }
});

// ROUTES
app.get("/manifest.json", (req, res) => {
    res.send(builder.getInterface().manifest);
});

app.get("/:resource/:type/:id/:extra?", async (req, res) => {
    const { resource, type, id, extra } = req.params;
    const handler = builder.getInterface().get(resource);
    if (!handler) return res.status(404).send("Not found");

    const result = await handler({ type, id, extra });
    res.send(result);
});

app.listen(PORT, () => {
    console.log(`✅ Greek Movies Addon running on http://localhost:${PORT}`);
});
