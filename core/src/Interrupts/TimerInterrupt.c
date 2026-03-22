#pragma bank 255
#include "TimerInterrupt.h"

typedef struct {
    uint32_t frequency_hz;
    uint8_t clock_select;
} TimerClockSetting;

static const TimerClockSetting timer_clock_settings[] = {
    { 65536U, INTERRUPT_TIMER_65KHZ },
    { 16384U, INTERRUPT_TIMER_16KHZ },
    { 4096U, INTERRUPT_TIMER_4KHZ }
};

static void resolve_timer_settings(uint16_t frequency_hz, uint8_t* clock_select, uint8_t* modulo) BANKED{
    uint8_t clock_index;

    for(clock_index = 0; clock_index != (sizeof(timer_clock_settings) / sizeof(timer_clock_settings[0])); clock_index++){
        uint32_t ticks_per_interrupt = timer_clock_settings[clock_index].frequency_hz / frequency_hz;

        if(ticks_per_interrupt != 0 && ticks_per_interrupt <= 256U){
            *clock_select = timer_clock_settings[clock_index].clock_select;
            *modulo = (uint8_t)(256U - ticks_per_interrupt);
            return;
        }
    }

    *clock_select = INTERRUPT_TIMER_4KHZ;
    *modulo = 0;
}

void init_timer_interrupt(uint16_t frequency_hz, InterruptCallback callback) BANKED{
    uint8_t clock_select;
    uint8_t modulo;

    if(frequency_hz == 0 || callback == 0){
        disable_timer_interrupt();
        return;
    }

    resolve_timer_settings(frequency_hz, &clock_select, &modulo);
    set_timer_interrupt_callback(clock_select, modulo, callback);
}

void stop_timer_interrupt(void) BANKED{
    disable_timer_interrupt();
}
