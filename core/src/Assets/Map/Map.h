#ifndef MAP_H
#define MAP_H
#include <stdint.h>
#include <gb/gb.h>
#include "Assets/SpaceManager.h"
#define TILE_SIZE_BYTES 16
typedef struct {
    uint8_t id;
    uint16_t width;
    uint16_t height;
    uint8_t* tileset;
    uint8_t num_tiles;
} Map;

void load_map();
#endif /* MAP_H */