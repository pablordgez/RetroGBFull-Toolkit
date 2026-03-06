#include "MapRegistry.h"

#define _MAP(name, _width, _height, _window_top_end, _window_bottom_start) \
    Map _##name = { \
        .id = name, \
        .width = _width, \
        .height = _height, \
        .tileset = name##_tileset, \
        .num_tiles = name##_num_tiles, \
        .window_top_end = _window_top_end, \
        .window_bottom_start = _window_bottom_start \
    };
    MAPS
#undef _MAP

#define _MAP(name, width, height, window_top_end, window_bottom_start) \
        [name] = &_##name,
    Map* maps[] = {
    MAPS
    };
#undef _MAP

#define _MAP(name, width, height, window_top_end, window_bottom_start) \
BANKREF_EXTERN(name##_bankref)
MAPS
#undef _MAP

#define _MAP(name, width, height, window_top_end, window_bottom_start) \
    [name] = {BANK(name##_bankref), name##_map_data},
const AssetEntry map_data[] = {
    MAPS
};
#undef _MAP
