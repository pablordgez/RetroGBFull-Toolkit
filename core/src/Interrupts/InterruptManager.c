#pragma bank 255
#include "InterruptManager.h"

static InterruptCallback interrupt_vblank_callbacks[INTERRUPT_MANAGER_MAX_CALLBACKS];
static InterruptCallback interrupt_timer_callbacks[INTERRUPT_MANAGER_MAX_CALLBACKS];
static InterruptCallback interrupt_serial_callbacks[INTERRUPT_MANAGER_MAX_CALLBACKS];
static volatile uint8_t interrupt_vblank_callback_count = 0;
static volatile uint8_t interrupt_timer_callback_count = 0;
static volatile uint8_t interrupt_serial_callback_count = 0;

static LcdScanlineInterrupt interrupt_lcd_events[INTERRUPT_MANAGER_MAX_LCD_EVENTS];
static volatile uint8_t interrupt_lcd_event_count = 0;
static volatile uint8_t interrupt_lcd_current_index = 0;
static uint8_t interrupt_manager_initialized = 0;

static void master_vblank_isr(void) NONBANKED{
    uint8_t callback_count = interrupt_vblank_callback_count;
    uint8_t callback_index;

    for(callback_index = 0; callback_index != callback_count; callback_index++){
        InterruptCallback callback = interrupt_vblank_callbacks[callback_index];
        if(callback != 0){
            callback();
        }
    }

    interrupt_lcd_current_index = 0;
    if(interrupt_lcd_event_count != 0){
        LYC_REG = interrupt_lcd_events[0].ly;
    }
}

static void master_lcd_isr(void) NONBANKED{
    uint8_t current_index = interrupt_lcd_current_index;
    uint8_t current_ly;

    if(current_index >= interrupt_lcd_event_count){
        return;
    }

    current_ly = interrupt_lcd_events[current_index].ly;
    while(current_index < interrupt_lcd_event_count && interrupt_lcd_events[current_index].ly == current_ly){
        InterruptCallback callback = interrupt_lcd_events[current_index].callback;
        if(callback != 0){
            callback();
        }
        current_index++;
    }

    interrupt_lcd_current_index = current_index;
    if(current_index < interrupt_lcd_event_count){
        LYC_REG = interrupt_lcd_events[current_index].ly;
    }
}

static void master_timer_isr(void) NONBANKED{
    uint8_t callback_count = interrupt_timer_callback_count;
    uint8_t callback_index;

    for(callback_index = 0; callback_index != callback_count; callback_index++){
        InterruptCallback callback = interrupt_timer_callbacks[callback_index];
        if(callback != 0){
            callback();
        }
    }
}

static void master_serial_isr(void) NONBANKED{
    uint8_t callback_count = interrupt_serial_callback_count;
    uint8_t callback_index;

    for(callback_index = 0; callback_index != callback_count; callback_index++){
        InterruptCallback callback = interrupt_serial_callbacks[callback_index];
        if(callback != 0){
            callback();
        }
    }
}

static uint8_t add_interrupt_callback(InterruptCallback callbacks[INTERRUPT_MANAGER_MAX_CALLBACKS], volatile uint8_t* callback_count, InterruptCallback callback){
    uint8_t callback_index;

    if(callback == 0){
        return 0;
    }

    for(callback_index = 0; callback_index != *callback_count; callback_index++){
        if(callbacks[callback_index] == callback){
            return 1;
        }
    }

    if(*callback_count >= INTERRUPT_MANAGER_MAX_CALLBACKS){
        return 0;
    }

    callbacks[*callback_count] = callback;
    *callback_count = *callback_count + 1U;
    return 1;
}

static uint8_t remove_interrupt_callback(InterruptCallback callbacks[INTERRUPT_MANAGER_MAX_CALLBACKS], volatile uint8_t* callback_count, InterruptCallback callback){
    uint8_t callback_index;

    for(callback_index = 0; callback_index != *callback_count; callback_index++){
        if(callbacks[callback_index] == callback){
            uint8_t shift_index;

            for(shift_index = callback_index; shift_index + 1U < *callback_count; shift_index++){
                callbacks[shift_index] = callbacks[shift_index + 1U];
            }

            *callback_count = *callback_count - 1U;
            callbacks[*callback_count] = 0;
            return 1;
        }
    }

    return 0;
}

void init_interrupt_manager(void) BANKED{
    CRITICAL {
        interrupt_vblank_callback_count = 0;
        interrupt_timer_callback_count = 0;
        interrupt_serial_callback_count = 0;
        interrupt_lcd_event_count = 0;
        interrupt_lcd_current_index = 0;

        STAT_REG |= STATF_LYC;
        IE_REG &= (uint8_t)~(VBL_IFLAG | LCD_IFLAG | TIM_IFLAG | SIO_IFLAG);
        IF_REG &= (uint8_t)~(VBL_IFLAG | LCD_IFLAG | TIM_IFLAG | SIO_IFLAG);

        if(interrupt_manager_initialized == 0){
            add_VBL(master_vblank_isr);
            add_LCD(master_lcd_isr);
            add_low_priority_TIM(master_timer_isr);
            add_SIO(master_serial_isr);
            interrupt_manager_initialized = 1;
        }
    }
}

uint8_t add_vblank_interrupt_callback(InterruptCallback callback) BANKED{
    uint8_t callback_added;

    CRITICAL {
        callback_added = add_interrupt_callback(interrupt_vblank_callbacks, &interrupt_vblank_callback_count, callback);
        if(interrupt_vblank_callback_count != 0){
            IE_REG |= VBL_IFLAG;
        }
    }

    return callback_added;
}

uint8_t remove_vblank_interrupt_callback(InterruptCallback callback) BANKED{
    uint8_t callback_removed;

    CRITICAL {
        callback_removed = remove_interrupt_callback(interrupt_vblank_callbacks, &interrupt_vblank_callback_count, callback);
        if(interrupt_vblank_callback_count == 0){
            IE_REG &= (uint8_t)~VBL_IFLAG;
            IF_REG &= (uint8_t)~VBL_IFLAG;
        }
    }

    return callback_removed;
}

void clear_vblank_interrupt_callbacks(void) BANKED{
    CRITICAL {
        interrupt_vblank_callback_count = 0;
        IE_REG &= (uint8_t)~VBL_IFLAG;
        IF_REG &= (uint8_t)~VBL_IFLAG;
    }
}

void set_vblank_interrupt_callback(InterruptCallback callback) BANKED{
    clear_vblank_interrupt_callbacks();
    if(callback != 0){
        add_vblank_interrupt_callback(callback);
    }
}

uint8_t add_serial_interrupt_callback(InterruptCallback callback) BANKED{
    uint8_t callback_added;

    CRITICAL {
        callback_added = add_interrupt_callback(interrupt_serial_callbacks, &interrupt_serial_callback_count, callback);
        if(interrupt_serial_callback_count != 0){
            IE_REG |= SIO_IFLAG;
        }
    }

    return callback_added;
}

uint8_t remove_serial_interrupt_callback(InterruptCallback callback) BANKED{
    uint8_t callback_removed;

    CRITICAL {
        callback_removed = remove_interrupt_callback(interrupt_serial_callbacks, &interrupt_serial_callback_count, callback);
        if(interrupt_serial_callback_count == 0){
            IE_REG &= (uint8_t)~SIO_IFLAG;
            IF_REG &= (uint8_t)~SIO_IFLAG;
        }
    }

    return callback_removed;
}

void clear_serial_interrupt_callbacks(void) BANKED{
    CRITICAL {
        interrupt_serial_callback_count = 0;
        IE_REG &= (uint8_t)~SIO_IFLAG;
        IF_REG &= (uint8_t)~SIO_IFLAG;
    }
}

void set_serial_interrupt_callback(InterruptCallback callback) BANKED{
    clear_serial_interrupt_callbacks();
    if(callback != 0){
        add_serial_interrupt_callback(callback);
    }
}

uint8_t add_timer_interrupt_callback(InterruptCallback callback) BANKED{
    uint8_t callback_added;

    CRITICAL {
        callback_added = add_interrupt_callback(interrupt_timer_callbacks, &interrupt_timer_callback_count, callback);
        if(interrupt_timer_callback_count != 0 && (TAC_REG & TACF_START) != 0){
            IE_REG |= TIM_IFLAG;
        }
    }

    return callback_added;
}

uint8_t remove_timer_interrupt_callback(InterruptCallback callback) BANKED{
    uint8_t callback_removed;

    CRITICAL {
        callback_removed = remove_interrupt_callback(interrupt_timer_callbacks, &interrupt_timer_callback_count, callback);
        if(interrupt_timer_callback_count == 0){
            TAC_REG = TACF_STOP;
            IE_REG &= (uint8_t)~TIM_IFLAG;
            IF_REG &= (uint8_t)~TIM_IFLAG;
        }
    }

    return callback_removed;
}

void clear_timer_interrupt_callbacks(void) BANKED{
    disable_timer_interrupt();
}

void set_timer_interrupt_callback(uint8_t clock_select, uint8_t modulo, InterruptCallback callback) BANKED{
    CRITICAL {
        TAC_REG = TACF_STOP;
        TMA_REG = modulo;
        TIMA_REG = modulo;
        interrupt_timer_callback_count = 0;

        if(callback != 0){
            add_interrupt_callback(interrupt_timer_callbacks, &interrupt_timer_callback_count, callback);
            IF_REG &= (uint8_t)~TIM_IFLAG;
            TAC_REG = (uint8_t)((clock_select & 0x03U) | TACF_START);
            IE_REG |= TIM_IFLAG;
        } else{
            IE_REG &= (uint8_t)~TIM_IFLAG;
            IF_REG &= (uint8_t)~TIM_IFLAG;
        }
    }
}

void disable_timer_interrupt(void) NONBANKED{
    CRITICAL {
        TAC_REG = TACF_STOP;
        interrupt_timer_callback_count = 0;
        IE_REG &= (uint8_t)~TIM_IFLAG;
        IF_REG &= (uint8_t)~TIM_IFLAG;
    }
}

void clear_lcd_scanline_interrupts(void) BANKED{
    CRITICAL {
        interrupt_lcd_event_count = 0;
        interrupt_lcd_current_index = 0;
        IE_REG &= (uint8_t)~LCD_IFLAG;
        IF_REG &= (uint8_t)~LCD_IFLAG;
    }
}

uint8_t add_lcd_scanline_interrupt(uint8_t ly, InterruptCallback callback) BANKED{
    uint8_t insert_index;

    if(callback == 0){
        return 0;
    }

    CRITICAL {
        if(interrupt_lcd_event_count < INTERRUPT_MANAGER_MAX_LCD_EVENTS){
            uint8_t shift_index;

            insert_index = 0;
            while(insert_index != interrupt_lcd_event_count && interrupt_lcd_events[insert_index].ly <= ly){
                insert_index++;
            }

            shift_index = interrupt_lcd_event_count;
            while(shift_index != insert_index){
                interrupt_lcd_events[shift_index] = interrupt_lcd_events[shift_index - 1U];
                shift_index--;
            }

            interrupt_lcd_events[insert_index].ly = ly;
            interrupt_lcd_events[insert_index].callback = callback;
            interrupt_lcd_event_count++;
            IE_REG |= LCD_IFLAG;
            insert_index = 1;
        } else{
            insert_index = 0;
        }
    }

    return insert_index;
}

uint8_t remove_lcd_scanline_interrupt(uint8_t ly, InterruptCallback callback) BANKED{
    uint8_t event_removed = 0;
    uint8_t event_index;

    CRITICAL {
        event_index = 0;
        while(event_index < interrupt_lcd_event_count){
            if(interrupt_lcd_events[event_index].ly == ly && interrupt_lcd_events[event_index].callback == callback){
                uint8_t shift_index;

                for(shift_index = event_index; shift_index + 1U < interrupt_lcd_event_count; shift_index++){
                    interrupt_lcd_events[shift_index] = interrupt_lcd_events[shift_index + 1U];
                }

                interrupt_lcd_event_count--;
                interrupt_lcd_events[interrupt_lcd_event_count].ly = 0;
                interrupt_lcd_events[interrupt_lcd_event_count].callback = 0;
                event_removed = 1;
                break;
            }
            event_index++;
        }

        interrupt_lcd_current_index = 0;
        if(interrupt_lcd_event_count == 0){
            IE_REG &= (uint8_t)~LCD_IFLAG;
            IF_REG &= (uint8_t)~LCD_IFLAG;
        } else{
            LYC_REG = interrupt_lcd_events[0].ly;
            IE_REG |= LCD_IFLAG;
        }
    }

    return event_removed;
}

void clear_lcd_scanline_interrupts_for_callback(InterruptCallback callback) BANKED{
    uint8_t event_index;

    if(callback == 0){
        return;
    }

    CRITICAL {
        event_index = 0;
        while(event_index < interrupt_lcd_event_count){
            if(interrupt_lcd_events[event_index].callback == callback){
                uint8_t shift_index;

                for(shift_index = event_index; shift_index + 1U < interrupt_lcd_event_count; shift_index++){
                    interrupt_lcd_events[shift_index] = interrupt_lcd_events[shift_index + 1U];
                }

                interrupt_lcd_event_count--;
                interrupt_lcd_events[interrupt_lcd_event_count].ly = 0;
                interrupt_lcd_events[interrupt_lcd_event_count].callback = 0;
            } else{
                event_index++;
            }
        }

        interrupt_lcd_current_index = 0;
        if(interrupt_lcd_event_count == 0){
            IE_REG &= (uint8_t)~LCD_IFLAG;
            IF_REG &= (uint8_t)~LCD_IFLAG;
        } else{
            LYC_REG = interrupt_lcd_events[0].ly;
            IE_REG |= LCD_IFLAG;
        }
    }
}
