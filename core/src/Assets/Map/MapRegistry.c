#include "MapRegistry.h"

#define _MAP(name, _width, _height) \
    const Map _##name = { \
        .id = name, \
        .width = _width, \
        .height = _height, \
        .tileset = name##_tileset, \
        .num_tiles = name##_num_tiles \
    };
    MAPS
#undef _MAP

#define _MAP(name, width, height) \
        [name] = &_##name,
    const Map* maps[] = {
    MAPS
    };
#undef _MAP

#define _MAP(name, width, height) \
BANKREF_EXTERN(name##_bankref)
MAPS
#undef _MAP

#define _MAP(name, width, height) \
    [name] = {BANK(name##_bankref), name##_map_data},
const AssetEntry map_data[] = {
    MAPS
};
#undef _MAP