#include "map.h"

void init_map(Map* map, uint16_t width, uint16_t height, const uint8_t* map_data, uint8_t id) {
    map->width = width;
    map->height = height;
    map->id = id;
}

