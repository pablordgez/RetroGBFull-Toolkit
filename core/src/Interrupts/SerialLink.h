#ifndef SERIAL_LINK_H
#define SERIAL_LINK_H

#include <gb/gb.h>
#include <stdint.h>

void init_serial_link(uint8_t is_master) BANKED;
void shutdown_serial_link(void) BANKED;
void send_serial_link_byte(uint8_t data) BANKED;
uint8_t serial_link_ready(void) BANKED;
uint8_t serial_link_has_error(void) BANKED;
uint8_t get_serial_link_byte(void) BANKED;

#endif /* SERIAL_LINK_H */
