#pragma bank 255
#include "Music.h"
#include "Interrupts/TimerInterrupt.h"

#define MUSIC_TIMER_FREQUENCY_HZ 60U

uint8_t current_tick = 0;
uint8_t current_step = 0;
uint8_t current_pattern_index = 0;
const Song* current_song = NULL;
uint8_t current_song_loop = 0;

uint8_t active_inst_ch1 = 0;
uint8_t active_inst_ch2 = 0;
uint8_t active_inst_ch4 = 0;

static void stop_music_playback_state(void) NONBANKED{
    current_song = NULL;
    current_song_loop = 0;
    current_tick = 0;
    current_step = 0;
    current_pattern_index = 0;
    active_inst_ch1 = 0;
    active_inst_ch2 = 0;
    active_inst_ch4 = 0;
    NR12_REG = 0x00;
    NR14_REG = 0x80;
    NR22_REG = 0x00;
    NR24_REG = 0x80;
    NR32_REG = 0x00;
    NR42_REG = 0x00;
    NR44_REG = 0x80;
}

static void music_timer_callback(void) NONBANKED{
    if(current_song == NULL){
        return;
    }

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
                    disable_timer_interrupt();
                    stop_music_playback_state();
                }
            }
        }
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
        current_tick = song->speed;
        current_step = 0;
        current_pattern_index = 0;
        active_inst_ch1 = 0;
        active_inst_ch2 = 0;
        active_inst_ch4 = 0;
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
        if (s1.instrument != 0){
            active_inst_ch1 = s1.instrument;
        }

        if (s1.note_index != NOTE_REST) {
            Instrument inst = song->instruments[active_inst_ch1];
            uint16_t freq = NOTE_FREQUENCIES[s1.note_index];
            NR11_REG = inst.reg1;
            NR12_REG = inst.reg2;
            NR13_REG = (uint8_t)(freq & 0xFF);         
            NR14_REG = (uint8_t)(freq >> 8) | 0x80;
        }
    }

    if (p2 != NULL) {
        Step s2 = p2->steps[current_step];
        if (s2.instrument != 0){
            active_inst_ch2 = s2.instrument;
        }
        if (s2.note_index != NOTE_REST) {
            Instrument inst = song->instruments[active_inst_ch2];
            uint16_t freq = NOTE_FREQUENCIES[s2.note_index];
            NR21_REG = inst.reg1;
            NR22_REG = inst.reg2;
            NR23_REG = (uint8_t)(freq & 0xFF);
            NR24_REG = (uint8_t)(freq >> 8) | 0x80;
        }
    }

    if (p4 != NULL) {
        Step s4 = p4->steps[current_step];
        if (s4.instrument != 0) active_inst_ch4 = s4.instrument;
        
        if (s4.note_index != NOTE_REST) { 
            Instrument inst = song->instruments[active_inst_ch4];
            NR41_REG = inst.reg1;
            NR42_REG = inst.reg2;
            NR43_REG = inst.reg3; 
            NR44_REG = 0x80;      
        }
    }

    SWITCH_ROM(prev_bank);
}

void music_update(void) BANKED {
    return;
}

void stop_music(void) NONBANKED {
    disable_timer_interrupt();
    stop_music_playback_state();
}
