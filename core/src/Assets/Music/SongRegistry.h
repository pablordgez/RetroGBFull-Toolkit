#ifndef SONG_REGISTRY_H
#define SONG_REGISTRY_H

#include "Music.h"

typedef enum {
    NUMBER_OF_SONGS = 1
} SongType;

extern const Song* const songs[NUMBER_OF_SONGS];

#endif /* SONG_REGISTRY_H */
