---
sidebar_position: 5
title: Audio
---

## `Music.h`

Header: `core/src/Assets/Music/Music.h`

### Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `NOTE_REST` | `0xFF` | Marks a silent step. |
| `PATTERN_LENGTH` | `16` | Number of steps per pattern. |

### `Instrument`

| Field | Type | Meaning |
| --- | --- | --- |
| `reg1`, `reg2`, `reg3` | `uint8_t` | Game Boy sound settings for the instrument. |

### `Step`

| Field | Type | Meaning |
| --- | --- | --- |
| `note_index` | `uint8_t` | Note constant, or `NOTE_REST`. |
| `instrument` | `uint8_t` | Zero-based index into the song instrument table. |

### `Pattern`

| Field | Type | Meaning |
| --- | --- | --- |
| `steps` | `Step[PATTERN_LENGTH]` | One 16-step sequence. |

### `Song`

| Field | Type | Meaning |
| --- | --- | --- |
| `bank` | `uint8_t` | ROM bank containing the song data. |
| `speed` | `uint8_t` | Ticks per pattern step. |
| `sequence_length` | `uint8_t` | Number of pattern entries in each channel sequence. |
| `instruments` | `const Instrument*` | Song instruments. |
| `ch1_seq` | `const Pattern* const*` | Channel 1 pattern sequence. |
| `ch2_seq` | `const Pattern* const*` | Channel 2 pattern sequence. |
| `ch4_seq` | `const Pattern* const*` | Channel 4 pattern sequence. |

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `current_song` | `const Song*` | Current song, or `NULL`. |

### Functions

| Function | Description |
| --- | --- |
| `void play_song(const Song* song, uint8_t loop) BANKED;` | Starts playing `song`. |
| `void stop_music(void) NONBANKED;` | Stops playback and silences the music channels. |

### Behavior notes

- Playback uses a 60 Hz timer callback.
- Channel 3 is not yet supported.
- A `Step.instrument` value of zero selects the first song instrument.

## `SongRegistry.h`

Header: `core/src/Assets/Music/SongRegistry.h`

### `SongType`

Default value in the shipped core:

- `NUMBER_OF_SONGS = 1`

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `songs` | `const Song* const [NUMBER_OF_SONGS]` | Generated song list. |

## `Notes.h`

Header: `core/src/Assets/Music/Notes.h`

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `NOTE_FREQUENCIES` | `const uint16_t[]` | Frequency values for the note constants below. |

### Note constants

`Notes.h` exposes note-index constants from `C_3` through `B_8`, including sharps such as `CS4`, `FS5`, and `AS7`.

Use them when building `Step.note_index` values:

```c
Step melody = { .note_index = C_5, .instrument = 1 };
Step rest = { .note_index = NOTE_REST, .instrument = 0 };
```
