#pragma bank 255
#include "Map.h"
#include "MapRegistry.h"

Map* THIS_MAP;
SpaceManager map_space_manager;
uint8_t map_loaded[NUMBER_OF_MAPS];

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
    if(window == 1){
        set_win_based_submap(0, 0, draw_w, draw_h, entry->data, THIS_MAP->width, THIS_MAP->first_tile);
    } else{
        set_bkg_based_submap(0, 0, draw_w, draw_h, entry->data, THIS_MAP->width, THIS_MAP->first_tile);
    }
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
    if(window == 1){
        set_win_based_submap(x, y, width, height, entry->data, THIS_MAP->width, THIS_MAP->first_tile);
    } else{
        set_bkg_based_submap(x, y, width, height, entry->data, THIS_MAP->width, THIS_MAP->first_tile);
    }
    SWITCH_ROM(prev_bank);
}
