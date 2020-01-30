# spotify-songkick-concert-playlist

Spotify-Songkick integration to match upcoming concerts to playlists with music from the bands

# Setup

`npm install`

Create a config.js file in the root with

```
module.exports = {
    songkickApiKey: '',
    spotifyClientId: '',
    spotifyClientSecret: '',
    START_DAY_OFFSET: 7,
    START_MONTH_OFFSET: 0,
    END_DAY_OFFSET: 14,
    END_MONTH_OFFSET: 0
};
```

# Run

`npm start`
or
`node spotify-songkick-integration.js`
