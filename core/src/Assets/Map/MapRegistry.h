#ifndef MAP_DECLARATIONS_H
#define MAP_DECLARATIONS_H

#include "Map.h"
#include "Assets/SpaceManager.h"

typedef enum {
    NUMBER_OF_MAPS = 1
} MapType;

extern Map* maps[NUMBER_OF_MAPS];
extern const AssetEntry map_data[NUMBER_OF_MAPS];

#endif /* MAP_DECLARATIONS_H */
