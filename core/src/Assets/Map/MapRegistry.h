#ifndef MAP_DECLARATIONS_H
#define MAP_DECLARATIONS_H

#include "Map.h"
#include "Assets/SpaceManager.h"
#include "map1/map1.h"
#include "ui_test/ui_test.h"

// name, width, height, window_top_end, window_bottom_start
#define MAPS \
    _MAP(map1, 64, 64, 0, 0) \
    _MAP(ui_test, 4, 1, 1, 0)
    
#define _MAP(name, width, height, window_top_end, window_bottom_start) name,
    typedef enum {
        MAPS
        NUMBER_OF_MAPS
    } MapType;
#undef _MAP

extern Map* maps[];
extern const AssetEntry map_data[];

#endif /* MAP_DECLARATIONS_H */
