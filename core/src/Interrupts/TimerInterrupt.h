#ifndef TIMER_INTERRUPT_H
#define TIMER_INTERRUPT_H

#include <stdint.h>
#include "InterruptManager.h"

void init_timer_interrupt(uint16_t frequency_hz, InterruptCallback callback) BANKED;
void stop_timer_interrupt(void) BANKED;

#endif /* TIMER_INTERRUPT_H */
