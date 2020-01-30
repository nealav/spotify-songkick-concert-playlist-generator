'use strict'
// https://github.com/RodrigoLeiteF/SpotifyFM
// https://stackoverflow.com/questions/31281390/spotify-api-authorization-for-cron-job
// https://github.com/thelinmichael/spotify-web-api-node#usage

const express = require('express');
const axios = require('axios').default;
const Spotify = require('spotify-web-api-node');
const util = require('util')
const open = require('open');
const moment = require('moment');

const config = require('./config');
const { similarity } = require('./stringUtils');

const app = express();

const SONGKICK_API_KEY = config.songkickApiKey;
const spotify = new Spotify({
    clientId: config.spotifyClientId,
    clientSecret: config.spotifyClientSecret,
    redirectUri: 'http://localhost:5000/spotify'
});

const START_DATE = moment().add({ months: config.START_MONTH_OFFSET, days: config.START_DAY_OFFSET }).format('YYYY-MM-DD');
const END_DATE = moment().add({ months: config.START_MONTH_OFFSET + config.END_MONTH_OFFSET, days: config.START_DAY_OFFSET + config.END_DAY_OFFSET }).format('YYYY-MM-DD');

//https://api.songkick.com/api/3.0/search/locations.json?query=SF%20Bay%20Area&apikey=hHSjLHKTmsfByvxU
//SF Bay Area Location ID: 26330

const delay = (time) => {
    new Promise(resolve => setTimeout(resolve, time));
};

console.full = (obj) => {
    console.log(util.inspect(obj, { showHidden: false, depth: null }));
};

const getUpcomingArtistsByConcert = async () => {

    let concerts = [];
    let totalEntries = Infinity;
    let perPage = 50;
    let page = 0;

    while (totalEntries >  perPage * page) {
        const response = await axios({
            method: 'GET',
            url: 'https://api.songkick.com/api/3.0/metro_areas/26330/calendar.json?', 
            params: {
                apikey: SONGKICK_API_KEY,
                min_date: START_DATE,
                max_date: END_DATE,
                page: page + 1, 
                per_page: perPage
            }
        });

        const data = response.data.resultsPage;
        concerts.push(...data.results.event);
        totalEntries = data.totalEntries;
        page++;
    }

    const results = concerts.map((concert) => {
        const artists = concert.performance.map((artist) => {
            return {
                displayName: artist.displayName
            };
        });
        
        return {
            displayName: concert.displayName,
            popularity: concert.popularity,
            date: concert.start.date,
            artists,
            venue: concert.venue.displayName,
        };
    });

    const popularResults = results.filter(result => result.popularity > 0.0001) //Filter Unpopular BS, this number is random, needs adjustment

    console.log('Fetched artists from Songkick API ...');
    return popularResults;
};

const authorizeSpotify = async () => {
    let data = await spotify.clientCredentialsGrant();
    await spotify.setAccessToken(data.body['access_token']);

    let authorizeURL = await spotify.createAuthorizeURL(
        ['playlist-modify-public', 'playlist-modify-private', 'playlist-read-private', 'playlist-read-collaborative'], 
        'CA'
    );

    return new Promise((resolve, reject) => {
        app.get('/spotify', async (req, res) => {
            try {
                let data = await spotify.authorizationCodeGrant(req.query.code);
                await spotify.setAccessToken(data.body['access_token']);
                await spotify.setRefreshToken(data.body['refresh_token']);
                res.send('<script> window.close() </script>');
                console.log('Set Authorized Creds to use Spotify API ...')
                resolve(true);
            }
            catch (err) {
                reject(err);
            }
        });

        app.listen(5000, async () => { });
        open(authorizeURL, { app: 'chrome' });
    })
};

const buildPlaylist = async (artistNames) => {
    const artists = [];
    const artistErrors = [];
    for (const name of artistNames) {
        await delay(Math.random() * (101 - 50) + 50);
        const artist = await spotify.searchArtists(name, { limit: 1 });
        if (artist.body.artists.total !== 0) { //Found artist
            const nameSimilarity = similarity(name, artist.body.artists.items[0].name);
            if (nameSimilarity < 0.90) {
                artistErrors.push(`ERROR: Artist similarity ${nameSimilarity} <= 0.90 for ${name} and ${artist.body.artists.items[0].name}`);
                continue;
            }

            console.log(`${name} => ${artist.body.artists.items[0].name} (${nameSimilarity})`);
            artists.push({
                id: artist.body.artists.items[0].id,
                name: artist.body.artists.items[0].name
            });
        } else {
            // The artist was not found on spotify
            artistErrors.push(`ERROR: No artist found for ${name}`);
        }
    }
    console.log(artistErrors);
    console.log('Fetched Artist Ids from Spotify API ...')

    const songs = [];
    const songErrors = [];
    for (const artist of artists) {
        await delay(Math.random() * (101 - 50) + 50);
        const topTenTracks = await spotify.getArtistTopTracks(artist.id, 'US');
        const track = topTenTracks.body.tracks[0];
        if (track.uri) {
            console.log(`${artist.name} => ${track.uri}`);
            songs.push({
                uri: track.uri,
                name: track.name
            });
        } else {
            songErrors.push(`ERROR: No track found for ${artist.name}(${artist.id})`);
        }
    }
    console.log(songErrors);
    console.log('Fetched Song Ids from Spotify API ...')

    const user = await spotify.getMe();
    const playlist = await spotify.createPlaylist(user.body.id, `${START_DATE} - ${END_DATE}`, { 'public' : false });
    const playlistId = playlist.body.id;

    const addTrackErrors = [];
    for (const song of songs) {
        await delay(Math.random() * (101 - 50) + 50);
        const addTracksSnapshot = await spotify.addTracksToPlaylist(playlistId, [song.uri]);
        if (addTracksSnapshot.body.snapshot_id) {
            console.log(`${song.name} added: ${addTracksSnapshot.body.snapshot_id}`);
        } else {
            addTrackErrors.push(`ERROR: Track ${song.name}(${song.uri}) not added to playlist`)
        }
    }
    console.log(addTrackErrors);
    console.log(`Created Playlist ${playlistId} with name ${START_DATE} - ${END_DATE}.`)
};

const main = async () => {
    try {
        const concertArtists = await getUpcomingArtistsByConcert();
        const artists = [];
        concertArtists.forEach((concert) => {
            artists.push(...concert.artists.map(artist => artist.displayName));
        });
        await authorizeSpotify();
        await buildPlaylist(artists);
    } catch (e) {
        console.error(e);
    }

    return process.exit(0);
};

(async () => {
    await main();
    setInterval(async () => {
        await main();
        return process.exit(1);
    }, 1000000);
})();
