#pragma bank 255
#include "Map.h"
#include "MapRegistry.h"

Map* THIS_MAP;
SpaceManager map_space_manager;

void init_map_system(void) BANKED{
    init_space_manager(&map_space_manager, 256);
}

void load_map(void) NONBANKED{
    uint8_t prev_bank = _current_bank;
    const AssetEntry* entry = &map_data[THIS_MAP->id];
    SWITCH_ROM(entry->bank);
    if(THIS_MAP->num_tiles > 0){
        uint8_t slot = register_space(&map_space_manager, THIS_MAP->num_tiles);
        THIS_MAP->first_tile = slot;
        set_bkg_data(slot, THIS_MAP->num_tiles, THIS_MAP->tileset);
    }
    uint8_t draw_w = (SCREEN_WIDTH >> 3) + 1; 
    uint8_t draw_h = (SCREEN_HEIGHT >> 3) + 1;
    if (draw_w > THIS_MAP->width) draw_w = THIS_MAP->width;
    if (draw_h > THIS_MAP->height) draw_h = THIS_MAP->height;

    set_bkg_submap(0, 0, draw_w, draw_h, entry->data, THIS_MAP->width);
    SWITCH_ROM(prev_bank);
}

void unload_map(void) BANKED{
    if(THIS_MAP->num_tiles > 0){
        remove_spaces(&map_space_manager, THIS_MAP->first_tile, THIS_MAP->num_tiles);
    }
}

void load_map_section(uint8_t x, uint8_t y, uint8_t width, uint8_t height) NONBANKED{
    uint8_t prev_bank = _current_bank;
    const AssetEntry* entry = &map_data[THIS_MAP->id];
    SWITCH_ROM(entry->bank);
    set_bkg_submap(x, y, width, height, entry->data, THIS_MAP->width);
    SWITCH_ROM(prev_bank);
}