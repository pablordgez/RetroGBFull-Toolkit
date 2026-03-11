#include "SongRegistry.h"

#define _SONG(name, _speed, _sequence_length, _instruments, _ch1_sequence, _ch2_sequence, _ch4_sequence) \
    BANKREF_EXTERN(name##_bankref) \
    const Song _##name = { \
        .bank = BANK(name##_bankref), \
        .speed = _speed, \
        .sequence_length = _sequence_length, \
        .instruments = _instruments, \
        .ch1_seq = _ch1_sequence, \
        .ch2_seq = _ch2_sequence, \
        .ch4_seq = _ch4_sequence \
    };
SONGS
#undef _SONG

#define _SONG(name, _speed, _sequence_length, _instruments, _ch1_sequence, _ch2_sequence, _ch4_sequence) \
    [name] = &_##name,
const Song* const songs[] = {
    SONGS
};
#undef _SONG