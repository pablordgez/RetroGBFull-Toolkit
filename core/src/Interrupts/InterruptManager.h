#ifndef INTERRUPT_MANAGER_H
#define INTERRUPT_MANAGER_H

#include <gb/gb.h>
#include <stdint.h>

#define INTERRUPT_MANAGER_MAX_CALLBACKS 8U
#define INTERRUPT_MANAGER_MAX_LCD_EVENTS 8U

#define INTERRUPT_TIMER_4KHZ TACF_4KHZ
#define INTERRUPT_TIMER_16KHZ TACF_16KHZ
#define INTERRUPT_TIMER_65KHZ TACF_65KHZ
#define INTERRUPT_TIMER_262KHZ TACF_262KHZ

typedef void (*InterruptCallback)(void);

typedef struct {
    uint8_t ly;
    InterruptCallback callback;
} LcdScanlineInterrupt;

void init_interrupt_manager(void) BANKED;
uint8_t add_vblank_interrupt_callback(InterruptCallback callback) BANKED;
uint8_t remove_vblank_interrupt_callback(InterruptCallback callback) BANKED;
void clear_vblank_interrupt_callbacks(void) BANKED;
void set_vblank_interrupt_callback(InterruptCallback callback) BANKED;
uint8_t add_serial_interrupt_callback(InterruptCallback callback) BANKED;
uint8_t remove_serial_interrupt_callback(InterruptCallback callback) BANKED;
void clear_serial_interrupt_callbacks(void) BANKED;
void set_serial_interrupt_callback(InterruptCallback callback) BANKED;
uint8_t add_timer_interrupt_callback(InterruptCallback callback) BANKED;
uint8_t remove_timer_interrupt_callback(InterruptCallback callback) BANKED;
void clear_timer_interrupt_callbacks(void) BANKED;
void set_timer_interrupt_callback(uint8_t clock_select, uint8_t modulo, InterruptCallback callback) BANKED;
void disable_timer_interrupt(void) NONBANKED;
void clear_lcd_scanline_interrupts(void) BANKED;
uint8_t add_lcd_scanline_interrupt(uint8_t ly, InterruptCallback callback) BANKED;
uint8_t remove_lcd_scanline_interrupt(uint8_t ly, InterruptCallback callback) BANKED;
void clear_lcd_scanline_interrupts_for_callback(InterruptCallback callback) BANKED;

#endif /* INTERRUPT_MANAGER_H */
