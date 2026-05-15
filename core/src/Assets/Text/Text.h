#ifndef TEXT_H
#define TEXT_H

#include <gb/gb.h>
#include <stdint.h>

typedef enum {
    TEXT_LAYER_BACKGROUND = 0,
    TEXT_LAYER_WINDOW = 1
} TextLayer;

typedef struct {
    uint8_t active;
    uint8_t layer;
    uint8_t x;
    uint8_t y;
    uint8_t tilemap_y;
    uint8_t width;
    uint8_t height;
    uint8_t saved_tiles_valid;
    uint8_t first_tile;
    uint8_t tile_count;
    uint8_t* saved_tiles;
    const unsigned char* text;
} TextHandle;

typedef struct {
    uint8_t tile_count;
    uint8_t x;
    uint8_t y;
    uint8_t width;
    uint8_t height;
} TextMetrics;

void init_text_system(void) BANKED;
void init_text_handle(TextHandle* handle) BANKED;
TextHandle* create_text_handle(void) BANKED;
void destroy_text_handle(TextHandle* handle) BANKED;
uint8_t measure_text(uint8_t x, uint8_t y, const unsigned char* text, TextMetrics* out) BANKED;
uint8_t draw_text(TextHandle* handle, TextLayer layer, uint8_t x, uint8_t y, const unsigned char* text) BANKED;
void remove_text(TextHandle* handle) BANKED;
uint8_t move_text(TextHandle* handle, uint8_t x, uint8_t y) BANKED;
uint8_t update_text(TextHandle* handle, const unsigned char* text) BANKED;
void clear_all_text(void) BANKED;
void text_set_font(uint8_t font_index) BANKED;
void text_set_colors(uint8_t fg, uint8_t bg) BANKED;

#endif /* TEXT_H */
