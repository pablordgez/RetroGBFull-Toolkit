#pragma bank 255
#include "SerialLink.h"
#include "InterruptManager.h"
#include <gb/gb.h>

static volatile uint8_t serial_link_busy = 0;
static volatile uint8_t serial_link_data = 0;
static volatile uint8_t serial_link_is_master = 0;
static volatile uint8_t serial_link_timeout_ticks = 0;
static volatile uint8_t serial_link_error = 0;

static void serial_link_transfer_callback(void) NONBANKED{
    serial_link_data = SB_REG;
    serial_link_busy = 0;
    serial_link_timeout_ticks = 0;
}

static void serial_link_timeout_callback(void) NONBANKED{
    if(serial_link_busy == 0){
        return;
    }

    serial_link_timeout_ticks++;
    if(serial_link_timeout_ticks > 10U){
        SC_REG = 0;
        serial_link_busy = 0;
        serial_link_timeout_ticks = 0;
        serial_link_error = 1;
        serial_link_data = 0xFF;
    }
}

void init_serial_link(uint8_t is_master) BANKED{
    CRITICAL {
        serial_link_busy = 0;
        serial_link_data = 0;
        serial_link_is_master = (is_master != 0);
        serial_link_timeout_ticks = 0;
        serial_link_error = 0;
        SC_REG = 0;
    }

    add_serial_interrupt_callback(serial_link_transfer_callback);
    add_vblank_interrupt_callback(serial_link_timeout_callback);
}

void shutdown_serial_link(void) BANKED{
    CRITICAL {
        SC_REG = 0;
        serial_link_busy = 0;
        serial_link_timeout_ticks = 0;
        serial_link_error = 0;
    }

    remove_serial_interrupt_callback(serial_link_transfer_callback);
    remove_vblank_interrupt_callback(serial_link_timeout_callback);
}

void send_serial_link_byte(uint8_t data) BANKED{
    CRITICAL {
        if(serial_link_busy == 0){
            serial_link_busy = 1;
            serial_link_error = 0;
            serial_link_timeout_ticks = 0;
            SB_REG = data;
            SC_REG = serial_link_is_master ? 0x81U : 0x80U;
        }
    }
}

uint8_t serial_link_ready(void) BANKED{
    return (serial_link_busy == 0);
}

uint8_t serial_link_has_error(void) BANKED{
    return serial_link_error;
}

uint8_t get_serial_link_byte(void) BANKED{
    return serial_link_data;
}
