#ifndef MAP_H
#define MAP_H
#include <stdint.h>
#include <gb/gb.h>
#include "Assets/SpaceManager.h"
#include "MainDefinitions.h"
#define TILE_SIZE_BYTES 16
typedef struct {
    uint8_t id;
    uint16_t width;
    uint16_t height;
    uint8_t* tileset;
    uint8_t num_tiles;
    uint8_t first_tile;

} Map;

extern Map* THIS_MAP;

void init_map_system(void) BANKED;
void load_map(uint8_t window) NONBANKED;
void unload_map(void) BANKED;
void load_map_section(uint8_t x, uint8_t y, uint8_t width, uint8_t height, uint8_t window) NONBANKED;
#endif /* MAP_H */