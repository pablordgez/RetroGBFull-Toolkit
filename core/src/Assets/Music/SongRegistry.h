#ifndef SONG_REGISTRY_H
#define SONG_REGISTRY_H

#include "Music.h"

#include "happybirthday/happybirthday.h"

// name, speed, sequence_length, instruments, ch1_sequence, ch2_sequence,
// ch4_sequence
#define SONGS \
    _SONG(happybirthday, 8, 1, happybirthday_instruments, \
        happybirthday_ch1_sequence, happybirthday_ch2_sequence, \
        happybirthday_ch4_sequence)

#define _SONG(name, speed, sequence_length, instruments, ch1_sequence, ch2_sequence, ch4_sequence) name,
typedef enum {
    SONGS
    NUMBER_OF_SONGS
} SongType;
#undef _SONG

extern const Song* const songs[];

#endif /* SONG_REGISTRY_H */