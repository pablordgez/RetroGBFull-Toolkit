#pragma bank 255
#include "Map.h"
#include "MapRegistry.h"
#include "Camera/Camera.h"

Map* THIS_MAP;
SpaceManager map_space_manager;
uint8_t map_loaded[NUMBER_OF_MAPS];

typedef struct {
    uint8_t x;
    uint8_t y;
    uint8_t tile;
} ChangedMapTile;

static ChangedMapTile changed_map_tiles[MAX_CHANGED_MAP_TILES];
static uint8_t changed_map_tile_count;

static uint8_t find_changed_map_tile(uint8_t x, uint8_t y) BANKED{
    for(uint8_t i = 0; i < changed_map_tile_count; i++){
        if(changed_map_tiles[i].x == x && changed_map_tiles[i].y == y){
            return i;
        }
    }
    return 255;
}

static uint8_t changed_map_tile_is_visible(uint8_t x, uint8_t y) BANKED{
    uint8_t view_x = camera_x >> 3;
    uint8_t view_y = camera_y >> 3;
    uint16_t view_right = (uint16_t)view_x + ((SCREEN_WIDTH >> 3) + 1);
    uint16_t view_bottom = (uint16_t)view_y + ((SCREEN_HEIGHT >> 3) + 1);

    return x >= view_x && x < view_right && y >= view_y && y < view_bottom;
}

static void redraw_changed_map_tile(uint8_t x, uint8_t y, uint8_t tile) BANKED{
    if(THIS_MAP == NULL || map_loaded[THIS_MAP->id] == 0 || !changed_map_tile_is_visible(x, y)){
        return;
    }
    set_bkg_based_tiles(x & 31, y & 31, 1, 1, &tile, THIS_MAP->first_tile);
}

static void draw_map_section(uint8_t x, uint8_t y, uint8_t width, uint8_t height, uint8_t window, const uint8_t* data) NONBANKED{
    if(window == 1){
        set_win_based_submap(x, y, width, height, data, THIS_MAP->width, THIS_MAP->first_tile);
        return;
    }

    set_bkg_based_submap(x, y, width, height, data, THIS_MAP->width, THIS_MAP->first_tile);

    if(changed_map_tile_count > 0){
        uint16_t x_end = (uint16_t)x + width;
        uint16_t y_end = (uint16_t)y + height;

        for(uint8_t i = 0; i < changed_map_tile_count; i++){
            ChangedMapTile* change = &changed_map_tiles[i];
            if(change->x < x || change->x >= x_end || change->y < y || change->y >= y_end){
                continue;
            }

            set_bkg_based_tiles(change->x & 31, change->y & 31, 1, 1, &change->tile, THIS_MAP->first_tile);
        }
    }
}

void init_map_system(void) BANKED{
    init_space_manager(&map_space_manager, 255);
}

void load_map(uint8_t window) NONBANKED{
    uint8_t prev_bank = _current_bank;
    const AssetEntry* entry = &map_data[THIS_MAP->id];
    map_loaded[THIS_MAP->id]++;
    SWITCH_ROM(entry->bank);
    if(THIS_MAP->num_tiles > 0 && map_loaded[THIS_MAP->id] == 1){
        uint8_t slot = register_space(&map_space_manager, THIS_MAP->num_tiles);
        if(slot == SPACE_MANAGER_INVALID_SLOT){
            map_loaded[THIS_MAP->id]--;
            SWITCH_ROM(prev_bank);
            return;
        }
        THIS_MAP->first_tile = slot;
        if(window == 1){
            set_win_data(slot, THIS_MAP->num_tiles, THIS_MAP->tileset);
        } else{
            set_bkg_data(slot, THIS_MAP->num_tiles, THIS_MAP->tileset);
        }
    }
    uint8_t draw_w = (SCREEN_WIDTH >> 3) + 1; 
    uint8_t draw_h = (SCREEN_HEIGHT >> 3) + 1;
    if (draw_w > THIS_MAP->width) draw_w = THIS_MAP->width;
    if (draw_h > THIS_MAP->height) draw_h = THIS_MAP->height;
    draw_map_section(0, 0, draw_w, draw_h, window, entry->data);
    SWITCH_ROM(prev_bank);
}

void unload_map(void) BANKED{
    map_loaded[THIS_MAP->id]--;
    if(THIS_MAP->num_tiles > 0 && map_loaded[THIS_MAP->id] == 0){
        remove_spaces(&map_space_manager, THIS_MAP->first_tile, THIS_MAP->num_tiles);
    }
}

void load_map_section(uint8_t x, uint8_t y, uint8_t width, uint8_t height, uint8_t window) NONBANKED{
    uint8_t prev_bank = _current_bank;
    const AssetEntry* entry = &map_data[THIS_MAP->id];
    SWITCH_ROM(entry->bank);
    draw_map_section(x, y, width, height, window, entry->data);
    SWITCH_ROM(prev_bank);
}

uint8_t register_changed_map_tile(uint8_t x, uint8_t y, uint8_t tile) BANKED{
    if(find_changed_map_tile(x, y) != 255 || changed_map_tile_count >= MAX_CHANGED_MAP_TILES){
        return 0;
    }

    changed_map_tiles[changed_map_tile_count].x = x;
    changed_map_tiles[changed_map_tile_count].y = y;
    changed_map_tiles[changed_map_tile_count].tile = tile;
    changed_map_tile_count++;
    redraw_changed_map_tile(x, y, tile);
    return 1;
}

uint8_t change_changed_map_tile(uint8_t x, uint8_t y, uint8_t tile) BANKED{
    uint8_t index = find_changed_map_tile(x, y);
    if(index == 255){
        return 0;
    }

    changed_map_tiles[index].tile = tile;
    redraw_changed_map_tile(x, y, tile);
    return 1;
}

uint8_t delete_changed_map_tile(uint8_t x, uint8_t y) BANKED{
    uint8_t index = find_changed_map_tile(x, y);
    if(index == 255){
        return 0;
    }

    changed_map_tile_count--;
    changed_map_tiles[index] = changed_map_tiles[changed_map_tile_count];
    if(THIS_MAP != NULL && map_loaded[THIS_MAP->id] > 0 && changed_map_tile_is_visible(x, y)){
        load_map_section(x, y, 1, 1, 0);
    }
    return 1;
}

void clear_changed_map_tiles(void) BANKED{
    changed_map_tile_count = 0;
    if(THIS_MAP != NULL && map_loaded[THIS_MAP->id] > 0){
        uint8_t x = camera_x >> 3;
        uint8_t y = camera_y >> 3;
        uint8_t width = (SCREEN_WIDTH >> 3) + 1;
        uint8_t height = (SCREEN_HEIGHT >> 3) + 1;

        if(x >= THIS_MAP->width || y >= THIS_MAP->height){
            return;
        }
        if((uint16_t)x + width > THIS_MAP->width) width = THIS_MAP->width - x;
        if((uint16_t)y + height > THIS_MAP->height) height = THIS_MAP->height - y;
        load_map_section(x, y, width, height, 0);
    }
}
