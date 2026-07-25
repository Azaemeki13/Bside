# User Preference Weighting System

## Overview

Weights:
- Like: +3.0
- Replay: +2.0
- Complete: +1.5
- Play: +0.5
- Skip: -1.0
- Unlike: removes the Like contribution

The current Like state will be read from the user's Liked Songs playlist.

For each user:
1. Group interactions by song.
2. Calculate the total weight for every song.
3. Add +3.0 when the song is currently liked.
4. Multiply each song vector by its total weight.
5. Add the weighted vectors together.
6. Normalize the result.
7. Save it in the user_preferences table.
