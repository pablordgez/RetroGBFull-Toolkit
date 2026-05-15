#ifndef WINDOW_VISIBILITY_H
#define WINDOW_VISIBILITY_H

#include <gb/gb.h>
#include <stdint.h>

#define WINDOW_VISIBILITY_OWNER_SCENE 1U
#define WINDOW_VISIBILITY_OWNER_TEXT 2U
#define WINDOW_VISIBILITY_MAX_BANDS 8U

void init_window_visibility_system(void) BANKED;
void window_visibility_clear_owner(uint8_t owner) BANKED;
uint8_t window_visibility_add_band(uint8_t owner, uint8_t start_ly, uint8_t end_ly) BANKED;
uint8_t window_visibility_apply(void) BANKED;
uint8_t window_visibility_get_tile_row_for_screen_y(uint8_t screen_ly) BANKED;

#endif /* WINDOW_VISIBILITY_H */
