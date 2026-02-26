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

void init_map_system(void);
void load_map(void);
void unload_map(void);
#endif /* MAP_H */