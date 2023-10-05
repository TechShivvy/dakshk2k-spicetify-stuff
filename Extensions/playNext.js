// @ts-check

// NAME: Play Next
// AUTHOR: daksh2k
// DESCRIPTION: Add the current track to the top of the queue

/// <reference path="../globals.d.ts" />

(function playNext() {
    if (!(Spicetify.CosmosAsync && Spicetify.Queue && Spicetify.ContextMenu && Spicetify.URI)) {
        setTimeout(playNext, 200);
        return;
    }

    // Add context menu option to tracks, playlist and albums
    function uriTrack(uris) {
        if (uris.length > 1) {
            return true;
        }
        const uriObj = Spicetify.URI.fromString(uris[0]);
        switch (uriObj.type) {
            case Spicetify.URI.Type.TRACK:
            case Spicetify.URI.Type.PLAYLIST:
            case Spicetify.URI.Type.PLAYLIST_V2:
            case Spicetify.URI.Type.ALBUM:
                return true;
        }
        return false;
    }

    function getToken() {
        return Spicetify.Platform.AuthorizationAPI._tokenProvider({
            preferCached: true,
        }).then((res) => res.accessToken);
    }

    const fetchAlbum = async (uri) => {
        const arg = uri.split(":")[2];
        const res = await Spicetify.CosmosAsync.get(`wg://album/v1/album-app/album/${arg}/desktop`);
        const items = [];
        for (const disc of res.discs) {
            const availables = disc.tracks.filter((track) => track.playable);
            items.push(...availables.map((track) => track.uri));
        }
        return items;
    };

    
    const fetchAlbumFromWebApi = async (url) => {
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${await getToken()}`,
            },
        });
        const albumDetails = await res.json();
        return [
            ...albumDetails.items.map((item) => item.uri),
            ...(!!albumDetails.next ? await fetchAlbumFromWebApi(albumDetails.next) : []),
        ];
    };

    //took this from shuffle+, credits to the original creators
    const fetchAlbumTracks = async(uri, includeMetadata = false) => {
    const { queryAlbumTracks } = Spicetify.GraphQL.Definitions;
    const { data, errors } = await Spicetify.GraphQL.Request(queryAlbumTracks, {
      uri,
      offset: 0,
      limit: 500,
    });

    if (errors) throw errors[0].message;
    if (data.albumUnion.playability.playable === false)
      throw "Album is not playable";

    return data.albumUnion.tracks.items
      .filter(({ track }) => track.playability.playable)
      .map(({ track }) => (includeMetadata ? track : track.uri));
  }

    const fetchPlaylist = async (uri) => {
        const res = await Spicetify.CosmosAsync.get(`sp://core-playlist/v1/playlist/${uri}/rows`, {
            policy: { link: true },
        });
        return res.rows.map((item) => item.link);
    };

    function shuffle(array) {
        let counter = array.length;
        if (counter <= 1) return array;

        const first = array[0];

        // While there are elements in the array
        while (counter > 0) {
            // Pick a random index
            let index = Math.floor(Math.random() * counter);

            // Decrease counter by 1
            counter--;

            // And swap the last element with it
            let temp = array[counter];
            array[counter] = array[index];
            array[index] = temp;
        }

        // Re-shuffle if first item is the same as pre-shuffled first item
        while (array[0] === first) {
            array = shuffle(array);
        }
        return array;
    }

    /**
     * Main entry point when clicked from context menu.
     * @param uris List of uris for uniquesly identifying tracks/playlist/album etc.
     * */
    async function fetchAndAdd(uris) {
        const uri = uris[0];
        const uriObj = Spicetify.URI.fromString(uri);
        if (uris.length > 1 || uriObj.type === Spicetify.URI.Type.TRACK) {
            addToNext(uris);
            return;
        }
        let tracks = [];
        switch (uriObj.type) {
            case Spicetify.URI.Type.PLAYLIST:
            case Spicetify.URI.Type.PLAYLIST_V2:
                tracks = await fetchPlaylist(uri);
                break;
            case Spicetify.URI.Type.ALBUM:
                // tracks = await fetchAlbumFromWebApi(
                //     `https://api.spotify.com/v1/albums/${uri.split(":")[2]}/tracks?limit=50`
                // );
                tracks=await fetchAlbumTracks(uri)
                break;
        }
        if (Spicetify.Player.getShuffle()) tracks = shuffle(tracks);
        addToNext(tracks);
    }

    /**
     * Add the selected track to the top of the queue and update the queue
     * @param uris List of uris/tracks to add.
     */

    
    /*    
    efficient way of adding the tracks at the top of queue, uses insertIntoQueue 
    instead of adding and reorderQueue
    also other QoL changes
    */
    async function addToNext(uris) {
    if (
      !uris.every(
        (uri) => Spicetify.URI.fromString(uri).type === Spicetify.URI.Type.TRACK
      )
    ) {
      Spicetify.showNotification("Malformed uris!");
      return;
    }
    const uriObjects = uris.map((uri) => ({ uri }));
    console.log("addToNext -> uriObjects:   ", uriObjects);
    const queue = await Spicetify.Platform.PlayerAPI.getQueue();

    if (queue.queued.length > 0) {
        //not empty, add all the tracks before first track
      const beforeTrack = {
        uri: queue.queued[0].uri,
        uid: queue.queued[0].uid,
      };
      await Spicetify.Platform.PlayerAPI.insertIntoQueue(uriObjects, {
        before: beforeTrack,
      });
    } else {
        //if queue empty, simply add to queue
      await Spicetify.Platform.PlayerAPI.addToQueue(uriObjects);
    }
  }

    // Add option to Context Menu
    new Spicetify.ContextMenu.Item(
        "Play Next",
        fetchAndAdd,
        uriTrack,
        `<svg role="img" height="16" width="16" viewBox="0 0 20 20" fill="currentColor"><path d="M3.67 8.67h14V11h-14V8.67zm0-4.67h14v2.33h-14V4zm0 9.33H13v2.34H3.67v-2.34zm11.66 0v7l5.84-3.5-5.84-3.5z"></path></svg>`
    ).register();
})();
