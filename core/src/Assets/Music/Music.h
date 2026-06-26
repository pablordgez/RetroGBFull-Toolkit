#ifndef MUSIC_H
#define MUSIC_H
#include <gb/gb.h>
#include <stdint.h>
#include "Notes.h"

#define NOTE_REST 0xFF
#define PATTERN_LENGTH 16

typedef struct {
    uint8_t sweep;
    uint8_t reg1;
    uint8_t reg2;
    uint8_t reg3;
} Instrument;

typedef struct {
    uint8_t note_index;
    uint8_t instrument;
} Step;

typedef struct {
    Step steps[PATTERN_LENGTH];
} Pattern;

typedef struct {
    uint8_t bank;
    uint8_t speed;
    uint8_t sequence_length;

    const Instrument* instruments;

    const Pattern* const* ch1_seq;
    const Pattern* const* ch2_seq;
    const Pattern* const* ch4_seq;
} Song;

void play_song(const Song* song, uint8_t loop) BANKED;
void play_music_step(void) NONBANKED;
void music_update(void) BANKED;
void stop_music(void) NONBANKED;

extern const Song* current_song;
#endif /* MUSIC_H */
