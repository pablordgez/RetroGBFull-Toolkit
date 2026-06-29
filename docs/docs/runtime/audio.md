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

### `MusicChannel`

| Value | Meaning |
| --- | --- |
| `MUSIC_CHANNEL_1` | Pulse channel 1. |
| `MUSIC_CHANNEL_2` | Pulse channel 2. |
| `MUSIC_CHANNEL_4` | Noise channel 4. |

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `current_song` | `const Song*` | Current song, or `NULL`. |

### Functions

| Function | Description |
| --- | --- |
| `void play_song(const Song* song, uint8_t loop) BANKED;` | Starts playing `song`. |
| `void pause_music(void) BANKED;` | Pauses song progression and silences music channels that are not currently playing a channel sequence. |
| `void resume_music(void) BANKED;` | Resumes the paused song from its saved tick, step, and sequence position. |
| `void stop_music(void) NONBANKED;` | Stops playback and silences the music channels. |
| `void play_music_channel_sequence(MusicChannel channel, const Pattern* const* sequence, uint8_t sequence_length, const Instrument* instruments, uint8_t speed);` | Plays a pattern sequence immediately on one channel, using the current ROM bank for the sequence and instrument data. |
| `void play_music_channel_sequence_banked(MusicChannel channel, const Pattern* const* sequence, uint8_t sequence_length, const Instrument* instruments, uint8_t speed, uint8_t bank) BANKED;` | Bank-explicit version of `play_music_channel_sequence`. Use this when the sequence belongs to a generated music asset in another bank. |
| `void stop_music_channel_sequence(MusicChannel channel) BANKED;` | Stops the active channel sequence on `channel` and returns the channel to the current song if one is playing. |

### Behavior notes

- Playback uses a 60 Hz timer callback.
- Channel 3 is not yet supported by the music sequencer.
- `stop_music()` clears the current song position. Use `pause_music()` and `resume_music()` when playback should continue later from the same position.
- Channel sequences are immediate overrides with no queue. If another sequence starts on the same channel before the previous one ends, the newer sequence owns the channel.
- When a channel sequence finishes, the channel returns to the current song. The music timeline keeps advancing while the channel is overridden.
- Channel sequences trim silent tails. If the remaining sequence contains only rests or empty pattern entries, the channel is released instead of waiting for the full pattern length.
- Restoring music re-triggers the last non-rest music step on that channel; it does not preserve the exact hardware envelope phase.
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
