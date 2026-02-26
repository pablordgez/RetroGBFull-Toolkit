#ifndef MAP_DECLARATIONS_H
#define MAP_DECLARATIONS_H

#include "Map.h"
#include "Assets/SpaceManager.h"
#include "map1/map1.h"

// name, width, height
#define MAPS \
    _MAP(map1, 64, 64)
    
#define _MAP(name, width, height) name,
    typedef enum {
        MAPS
        NUMBER_OF_MAPS
    } MapType;
#undef _MAP

extern const Map* maps[];
extern const AssetEntry map_data[];

#endif /* MAP_DECLARATIONS_H */