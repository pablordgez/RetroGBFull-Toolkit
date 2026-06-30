#pragma bank 255
#include "Music.h"
#include "Interrupts/TimerInterrupt.h"

#define MUSIC_TIMER_FREQUENCY_HZ 60U
#define MUSIC_CHANNEL_COUNT 3U

typedef struct {
    uint8_t active;
    uint8_t bank;
    uint8_t speed;
    uint8_t tick;
    uint8_t step;
    uint8_t current_pattern_index;
    uint8_t sequence_length;
    uint8_t end_step;
    const Instrument* instruments;
    const Pattern* const* sequence;
} ChannelSequence;

uint8_t current_tick = 0;
uint8_t current_step = 0;
uint8_t current_pattern_index = 0;
const Song* current_song = NULL;
uint8_t current_song_loop = 0;
static uint8_t current_song_paused = 0;
static ChannelSequence channel_sequences[MUSIC_CHANNEL_COUNT];
static Step last_music_steps[MUSIC_CHANNEL_COUNT];
static uint8_t last_music_steps_valid[MUSIC_CHANNEL_COUNT];

static void music_timer_callback(void) NONBANKED;

static uint8_t any_channel_sequence_active(void) NONBANKED{
    return channel_sequences[MUSIC_CHANNEL_1].active ||
        channel_sequences[MUSIC_CHANNEL_2].active ||
        channel_sequences[MUSIC_CHANNEL_4].active;
}

static void restore_music_channel(uint8_t channel) NONBANKED{
    Step step;
    Instrument inst;
    uint16_t freq;
    uint8_t prev_bank;

    if(current_song == NULL || current_song_paused || last_music_steps_valid[channel] == 0){
        if(channel == MUSIC_CHANNEL_1){
            NR10_REG = 0x00;
            NR12_REG = 0x00;
            NR14_REG = 0x80;
        } else if(channel == MUSIC_CHANNEL_2){
            NR22_REG = 0x00;
            NR24_REG = 0x80;
        } else{
            NR42_REG = 0x00;
            NR44_REG = 0x80;
        }
        return;
    }

    prev_bank = _current_bank;
    SWITCH_ROM(current_song->bank);
    step = last_music_steps[channel];
    inst = current_song->instruments[step.instrument];

    if(channel == MUSIC_CHANNEL_1){
        freq = NOTE_FREQUENCIES[step.note_index];
        NR10_REG = inst.sweep;
        NR11_REG = inst.reg1;
        NR12_REG = inst.reg2;
        NR13_REG = (uint8_t)(freq & 0xFF);
        NR14_REG = (uint8_t)(freq >> 8) | 0x80;
    } else if(channel == MUSIC_CHANNEL_2){
        freq = NOTE_FREQUENCIES[step.note_index];
        NR21_REG = inst.reg1;
        NR22_REG = inst.reg2;
        NR23_REG = (uint8_t)(freq & 0xFF);
        NR24_REG = (uint8_t)(freq >> 8) | 0x80;
    } else{
        NR41_REG = inst.reg1;
        NR42_REG = inst.reg2;
        NR43_REG = inst.reg3;
        NR44_REG = 0x80;
    }

    SWITCH_ROM(prev_bank);
}

static void stop_music_playback_state(void) NONBANKED{
    current_song = NULL;
    current_song_loop = 0;
    current_song_paused = 0;
    current_tick = 0;
    current_step = 0;
    current_pattern_index = 0;
    channel_sequences[MUSIC_CHANNEL_1].active = 0;
    channel_sequences[MUSIC_CHANNEL_2].active = 0;
    channel_sequences[MUSIC_CHANNEL_4].active = 0;
    last_music_steps_valid[MUSIC_CHANNEL_1] = 0;
    last_music_steps_valid[MUSIC_CHANNEL_2] = 0;
    last_music_steps_valid[MUSIC_CHANNEL_4] = 0;
    NR10_REG = 0x00;
    NR12_REG = 0x00;
    NR14_REG = 0x80;
    NR22_REG = 0x00;
    NR24_REG = 0x80;
    NR32_REG = 0x00;
    NR42_REG = 0x00;
    NR44_REG = 0x80;
}

static void play_channel_sequence_step(uint8_t channel) NONBANKED{
    ChannelSequence* sequence = &channel_sequences[channel];
    uint8_t prev_bank;
    const Pattern* pattern;
    Step step;
    Instrument inst;
    uint16_t freq;

    if(sequence->current_pattern_index >= sequence->sequence_length ||
        (sequence->current_pattern_index == (uint8_t)(sequence->sequence_length - 1U) && sequence->step > sequence->end_step)){
        sequence->active = 0;
        restore_music_channel(channel);
        return;
    }

    prev_bank = _current_bank;
    SWITCH_ROM(sequence->bank);
    pattern = sequence->sequence[sequence->current_pattern_index];

    if(pattern != NULL){
        step = pattern->steps[sequence->step];
        if(step.note_index != NOTE_REST){
            inst = sequence->instruments[step.instrument];
            if(channel == MUSIC_CHANNEL_1){
                freq = NOTE_FREQUENCIES[step.note_index];
                NR10_REG = inst.sweep;
                NR11_REG = inst.reg1;
                NR12_REG = inst.reg2;
                NR13_REG = (uint8_t)(freq & 0xFF);
                NR14_REG = (uint8_t)(freq >> 8) | 0x80;
            } else if(channel == MUSIC_CHANNEL_2){
                freq = NOTE_FREQUENCIES[step.note_index];
                NR21_REG = inst.reg1;
                NR22_REG = inst.reg2;
                NR23_REG = (uint8_t)(freq & 0xFF);
                NR24_REG = (uint8_t)(freq >> 8) | 0x80;
            } else{
                NR41_REG = inst.reg1;
                NR42_REG = inst.reg2;
                NR43_REG = inst.reg3;
                NR44_REG = 0x80;
            }
        }
    }

    SWITCH_ROM(prev_bank);

    sequence->step++;
    if(sequence->step >= PATTERN_LENGTH){
        sequence->step = 0;
        sequence->current_pattern_index++;
    }
}

static void update_channel_sequence(uint8_t channel) NONBANKED{
    ChannelSequence* sequence = &channel_sequences[channel];

    if(sequence->active == 0){
        return;
    }

    sequence->tick++;
    if(sequence->tick >= sequence->speed){
        sequence->tick = 0;
        play_channel_sequence_step(channel);
    }
}

static uint8_t find_channel_sequence_end_banked(const Pattern* const* sequence, uint8_t sequence_length, uint8_t bank, uint8_t* trimmed_sequence_length, uint8_t* end_step) NONBANKED{
    uint8_t prev_bank;
    uint8_t local_sequence_length = sequence_length;
    uint8_t step_index = 0;
    uint8_t found_sound = 0;
    const Pattern* pattern;

    prev_bank = _current_bank;
    SWITCH_ROM(bank);

    while(local_sequence_length != 0 && found_sound == 0){
        pattern = sequence[(uint8_t)(local_sequence_length - 1U)];
        if(pattern != NULL){
            step_index = PATTERN_LENGTH;
            while(step_index != 0){
                step_index--;
                if(pattern->steps[step_index].note_index != NOTE_REST){
                    found_sound = 1;
                    break;
                }
            }
        }

        if(found_sound == 0){
            local_sequence_length--;
        }
    }

    SWITCH_ROM(prev_bank);

    *trimmed_sequence_length = local_sequence_length;
    *end_step = step_index;
    return found_sound;
}

static void music_timer_callback(void) NONBANKED{
    if(current_song != NULL && current_song_paused == 0){
        current_tick++;
        if(current_tick >= current_song->speed){
            current_tick = 0;
            play_music_step();

            current_step++;
            if(current_step >= PATTERN_LENGTH){
                current_step = 0;
                current_pattern_index++;
                if(current_pattern_index >= current_song->sequence_length){
                    if(current_song_loop){
                        current_pattern_index = 0;
                    } else{
                        current_song = NULL;
                        current_song_loop = 0;
                        last_music_steps_valid[MUSIC_CHANNEL_1] = 0;
                        last_music_steps_valid[MUSIC_CHANNEL_2] = 0;
                        last_music_steps_valid[MUSIC_CHANNEL_4] = 0;
                        if(channel_sequences[MUSIC_CHANNEL_1].active == 0){
                            NR10_REG = 0x00;
                            NR12_REG = 0x00;
                            NR14_REG = 0x80;
                        }
                        if(channel_sequences[MUSIC_CHANNEL_2].active == 0){
                            NR22_REG = 0x00;
                            NR24_REG = 0x80;
                        }
                        if(channel_sequences[MUSIC_CHANNEL_4].active == 0){
                            NR42_REG = 0x00;
                            NR44_REG = 0x80;
                        }
                    }
                }
            }
        }
    }

    update_channel_sequence(MUSIC_CHANNEL_1);
    update_channel_sequence(MUSIC_CHANNEL_2);
    update_channel_sequence(MUSIC_CHANNEL_4);

    if((current_song == NULL || current_song_paused) && any_channel_sequence_active() == 0){
        disable_timer_interrupt();
    }
}

void play_song(const Song* song, uint8_t loop) BANKED {
    disable_timer_interrupt();

    NR52_REG = 0x80; 
    NR51_REG = 0xFF; 
    NR50_REG = 0x77;

    CRITICAL {
        current_song = song;
        current_song_loop = loop;
        current_song_paused = 0;
        current_tick = song->speed;
        current_step = 0;
        current_pattern_index = 0;
        last_music_steps_valid[MUSIC_CHANNEL_1] = 0;
        last_music_steps_valid[MUSIC_CHANNEL_2] = 0;
        last_music_steps_valid[MUSIC_CHANNEL_4] = 0;
    }

    init_timer_interrupt(MUSIC_TIMER_FREQUENCY_HZ, music_timer_callback);
}

void play_music_step(void) NONBANKED{
    const Song* song;

    if(current_song == NULL){
        return;
    }

    song = current_song;
    uint8_t prev_bank = _current_bank;
    SWITCH_ROM(song->bank);
    const Pattern* p1 = song->ch1_seq[current_pattern_index];
    const Pattern* p2 = song->ch2_seq[current_pattern_index];
    const Pattern* p4 = song->ch4_seq[current_pattern_index];

    if (p1 != NULL) {
        Step s1 = p1->steps[current_step];

        if (s1.note_index != NOTE_REST) {
            last_music_steps[MUSIC_CHANNEL_1] = s1;
            last_music_steps_valid[MUSIC_CHANNEL_1] = 1;
            if(channel_sequences[MUSIC_CHANNEL_1].active == 0){
                Instrument inst = song->instruments[s1.instrument];
                uint16_t freq = NOTE_FREQUENCIES[s1.note_index];
                NR10_REG = inst.sweep;
                NR11_REG = inst.reg1;
                NR12_REG = inst.reg2;
                NR13_REG = (uint8_t)(freq & 0xFF);         
                NR14_REG = (uint8_t)(freq >> 8) | 0x80;
            }
        }
    }

    if (p2 != NULL) {
        Step s2 = p2->steps[current_step];
        if (s2.note_index != NOTE_REST) {
            last_music_steps[MUSIC_CHANNEL_2] = s2;
            last_music_steps_valid[MUSIC_CHANNEL_2] = 1;
            if(channel_sequences[MUSIC_CHANNEL_2].active == 0){
                Instrument inst = song->instruments[s2.instrument];
                uint16_t freq = NOTE_FREQUENCIES[s2.note_index];
                NR21_REG = inst.reg1;
                NR22_REG = inst.reg2;
                NR23_REG = (uint8_t)(freq & 0xFF);
                NR24_REG = (uint8_t)(freq >> 8) | 0x80;
            }
        }
    }

    if (p4 != NULL) {
        Step s4 = p4->steps[current_step];
        
        if (s4.note_index != NOTE_REST) { 
            last_music_steps[MUSIC_CHANNEL_4] = s4;
            last_music_steps_valid[MUSIC_CHANNEL_4] = 1;
            if(channel_sequences[MUSIC_CHANNEL_4].active == 0){
                Instrument inst = song->instruments[s4.instrument];
                NR41_REG = inst.reg1;
                NR42_REG = inst.reg2;
                NR43_REG = inst.reg3; 
                NR44_REG = 0x80;
            }
        }
    }

    SWITCH_ROM(prev_bank);
}

void music_update(void) BANKED {
    return;
}

void pause_music(void) BANKED {
    current_song_paused = 1;

    if(channel_sequences[MUSIC_CHANNEL_1].active == 0){
        NR10_REG = 0x00;
        NR12_REG = 0x00;
        NR14_REG = 0x80;
    }
    if(channel_sequences[MUSIC_CHANNEL_2].active == 0){
        NR22_REG = 0x00;
        NR24_REG = 0x80;
    }
    if(channel_sequences[MUSIC_CHANNEL_4].active == 0){
        NR42_REG = 0x00;
        NR44_REG = 0x80;
    }

    if(any_channel_sequence_active() == 0){
        disable_timer_interrupt();
    }
}

void resume_music(void) BANKED {
    if(current_song == NULL){
        return;
    }

    current_song_paused = 0;

    if(channel_sequences[MUSIC_CHANNEL_1].active == 0){
        restore_music_channel(MUSIC_CHANNEL_1);
    }
    if(channel_sequences[MUSIC_CHANNEL_2].active == 0){
        restore_music_channel(MUSIC_CHANNEL_2);
    }
    if(channel_sequences[MUSIC_CHANNEL_4].active == 0){
        restore_music_channel(MUSIC_CHANNEL_4);
    }

    init_timer_interrupt(MUSIC_TIMER_FREQUENCY_HZ, music_timer_callback);
}

void stop_music(void) NONBANKED {
    disable_timer_interrupt();
    stop_music_playback_state();
}

void play_music_channel_sequence_banked(MusicChannel channel, const Pattern* const* sequence, uint8_t sequence_length, const Instrument* instruments, uint8_t speed, uint8_t bank) BANKED {
    ChannelSequence* channel_sequence;
    uint8_t trimmed_sequence_length;
    uint8_t step_index = 0;

    if(channel >= MUSIC_CHANNEL_COUNT){
        return;
    }

    if(sequence == NULL || sequence_length == 0 || instruments == NULL || speed == 0){
        stop_music_channel_sequence(channel);
        return;
    }

    disable_timer_interrupt();

    NR52_REG = 0x80;
    NR51_REG = 0xFF;
    NR50_REG = 0x77;

    if(find_channel_sequence_end_banked(sequence, sequence_length, bank, &trimmed_sequence_length, &step_index) == 0){
        channel_sequences[channel].active = 0;
        restore_music_channel(channel);
        if((current_song != NULL && current_song_paused == 0) || any_channel_sequence_active()){
            init_timer_interrupt(MUSIC_TIMER_FREQUENCY_HZ, music_timer_callback);
        }
        return;
    }

    channel_sequence = &channel_sequences[channel];
    channel_sequence->active = 1;
    channel_sequence->bank = bank;
    channel_sequence->speed = speed;
    channel_sequence->tick = 0;
    channel_sequence->step = 0;
    channel_sequence->current_pattern_index = 0;
    channel_sequence->sequence_length = trimmed_sequence_length;
    channel_sequence->end_step = step_index;
    channel_sequence->instruments = instruments;
    channel_sequence->sequence = sequence;

    play_channel_sequence_step(channel);
    init_timer_interrupt(MUSIC_TIMER_FREQUENCY_HZ, music_timer_callback);
}

void stop_music_channel_sequence(MusicChannel channel) BANKED {
    if(channel >= MUSIC_CHANNEL_COUNT){
        return;
    }

    if(channel_sequences[channel].active == 0){
        return;
    }

    channel_sequences[channel].active = 0;
    restore_music_channel(channel);

    if((current_song == NULL || current_song_paused) && any_channel_sequence_active() == 0){
        disable_timer_interrupt();
    }
}
