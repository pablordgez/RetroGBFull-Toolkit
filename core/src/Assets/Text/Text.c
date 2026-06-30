#pragma bank 255
#define TEXT_IMPLEMENTATION
#include "Text.h"
#include "Assets/Map/Map.h"
#include "VWF/vwf.h"
#include "VWF/vwf_font.h"
#include "Window/WindowVisibility.h"
#include <stdlib.h>
#include <string.h>

#define TEXT_MAX_ACTIVE_HANDLES 8U

static TextHandle* text_active_handles[TEXT_MAX_ACTIVE_HANDLES];
static uint8_t text_active_handle_count = 0;
static uint8_t text_current_font = 0;

static uint8_t text_register_handle(TextHandle* handle){
    uint8_t index;

    for(index = 0; index < text_active_handle_count; index++){
        if(text_active_handles[index] == handle){
            return 1;
        }
    }

    if(text_active_handle_count >= TEXT_MAX_ACTIVE_HANDLES){
        return 0;
    }

    text_active_handles[text_active_handle_count++] = handle;
    return 1;
}

static void text_unregister_handle(TextHandle* handle){
    uint8_t index = 0;

    while(index < text_active_handle_count){
        if(text_active_handles[index] == handle){
            uint8_t shift_index;

            for(shift_index = index; shift_index + 1U < text_active_handle_count; shift_index++){
                text_active_handles[shift_index] = text_active_handles[shift_index + 1U];
            }

            text_active_handle_count--;
            text_active_handles[text_active_handle_count] = (void*)0;
            return;
        }
        index++;
    }
}

static void text_backup_tiles(TextHandle* handle){
    if(handle->layer == TEXT_LAYER_WINDOW){
        get_win_tiles(handle->x, handle->tilemap_y, handle->width, handle->height, handle->saved_tiles);
    } else{
        get_bkg_tiles(handle->x, handle->y, handle->width, handle->height, handle->saved_tiles);
    }
    handle->saved_tiles_valid = 1;
}

static void text_restore_tiles(TextHandle* handle){
    if(handle->saved_tiles == (void*)0 || handle->saved_tiles_valid == 0 || handle->width == 0 || handle->height == 0){
        return;
    }

    if(handle->layer == TEXT_LAYER_WINDOW){
        set_win_tiles(handle->x, handle->tilemap_y, handle->width, handle->height, handle->saved_tiles);
    } else{
        set_bkg_tiles(handle->x, handle->y, handle->width, handle->height, handle->saved_tiles);
    }
    handle->saved_tiles_valid = 0;
}

static uint8_t text_draw_vwf_y_offset_banked(uint8_t x, uint8_t y, uint8_t first_tile, const unsigned char* text, uint8_t y_offset, uint8_t text_bank, uint8_t staged){
    uint8_t previous_mode = vwf_mode;
    uint8_t rendered_tiles;

    if(staged){
        vwf_set_mode(VWF_MODE_RENDER);
        vwf_draw_text_y_offset_banked(x, y, first_tile, text, y_offset, text_bank);
        vwf_set_mode(VWF_MODE_PRINT_ONLY);
        rendered_tiles = vwf_draw_text_y_offset_banked(x, y, first_tile, text, y_offset, text_bank);
    } else{
        vwf_set_mode(VWF_MODE_PRINT);
        rendered_tiles = vwf_draw_text_y_offset_banked(x, y, first_tile, text, y_offset, text_bank);
    }

    vwf_set_mode(previous_mode);
    return rendered_tiles;
}

static uint8_t text_draw_vwf_banked(uint8_t x, uint8_t y, uint8_t first_tile, const unsigned char* text, uint8_t text_bank, uint8_t staged){
    return text_draw_vwf_y_offset_banked(x, y, first_tile, text, 0, text_bank, staged);
}

static uint8_t text_ranges_overlap(uint8_t a_start, uint8_t a_size, uint8_t b_start, uint8_t b_size){
    return a_start < (uint8_t)(b_start + b_size) && b_start < (uint8_t)(a_start + a_size);
}

static uint8_t text_window_handles_overlap(TextHandle* a, uint8_t a_tilemap_y, TextHandle* b, uint8_t b_tilemap_y){
    return text_ranges_overlap(a->x, a->width, b->x, b->width) &&
        text_ranges_overlap(a_tilemap_y, a->height, b_tilemap_y, b->height);
}

static uint8_t text_refresh_window_visibility_bands(void){
    uint8_t index;

    window_visibility_clear_owner(WINDOW_VISIBILITY_OWNER_TEXT);
    for(index = 0; index < text_active_handle_count; index++){
        TextHandle* handle = text_active_handles[index];

        if(handle != (void*)0 && handle->active && handle->layer == TEXT_LAYER_WINDOW && handle->height != 0){
            if(window_visibility_add_band(WINDOW_VISIBILITY_OWNER_TEXT, handle->y << 3, (handle->y + handle->height) << 3) == 0){
                return 0;
            }
        }
    }

    return 1;
}

static uint8_t text_rebuild_window_texts(void){
    uint8_t index;

    for(index = 0; index < text_active_handle_count; index++){
        TextHandle* handle = text_active_handles[index];

        if(handle != (void*)0 && handle->active && handle->layer == TEXT_LAYER_WINDOW && handle->height != 0){
            text_restore_tiles(handle);
        }
    }

    if(text_refresh_window_visibility_bands() == 0){
        return 0;
    }

    for(index = 0; index < text_active_handle_count; index++){
        TextHandle* handle = text_active_handles[index];

        if(handle != (void*)0 && handle->active && handle->layer == TEXT_LAYER_WINDOW && handle->height != 0){
            uint8_t y_offset;

            handle->tilemap_y = window_visibility_get_tile_row_for_screen_y(handle->y << 3);
            text_backup_tiles(handle);

            vwf_activate_font(text_current_font);
            vwf_set_destination(VWF_RENDER_WIN);
            y_offset = (uint8_t)(handle->y - handle->tilemap_y);
            text_draw_vwf_y_offset_banked(handle->x, handle->y, handle->first_tile, handle->text, y_offset, handle->text_bank, 1);
        }
    }

    return window_visibility_apply();
}

static uint8_t text_try_draw_new_window_text(TextHandle* target){
    uint8_t index;
    uint8_t target_tilemap_y;
    uint8_t y_offset;

    if(target == (void*)0 || target->active == 0 || target->layer != TEXT_LAYER_WINDOW){
        return 0;
    }

    if(text_refresh_window_visibility_bands() == 0){
        return 0;
    }

    target_tilemap_y = window_visibility_get_tile_row_for_screen_y(target->y << 3);

    for(index = 0; index < text_active_handle_count; index++){
        TextHandle* handle = text_active_handles[index];

        if(handle == (void*)0 || handle == target || handle->active == 0 || handle->layer != TEXT_LAYER_WINDOW || handle->height == 0){
            continue;
        }

        if(window_visibility_get_tile_row_for_screen_y(handle->y << 3) != handle->tilemap_y){
            return 0;
        }

        if(text_window_handles_overlap(target, target_tilemap_y, handle, handle->tilemap_y)){
            return 0;
        }
    }

    target->tilemap_y = target_tilemap_y;
    text_backup_tiles(target);

    vwf_activate_font(text_current_font);
    vwf_set_destination(VWF_RENDER_WIN);
    y_offset = (uint8_t)(target->y - target->tilemap_y);
    text_draw_vwf_y_offset_banked(target->x, target->y, target->first_tile, target->text, y_offset, target->text_bank, 1);
    return window_visibility_apply();
}

static void text_remove_handle(TextHandle* handle, uint8_t rebuild_window){
    uint8_t was_window;

    if(handle == (void*)0 || handle->active == 0){
        return;
    }

    was_window = (handle->layer == TEXT_LAYER_WINDOW);
    text_restore_tiles(handle);
    remove_spaces(&map_space_manager, handle->first_tile, handle->tile_count);
    text_unregister_handle(handle);

    if(handle->saved_tiles != (void*)0){
        free(handle->saved_tiles);
    }

    handle->active = 0;
    handle->saved_tiles = (void*)0;
    handle->saved_tiles_valid = 0;
    handle->tile_count = 0;
    handle->width = 0;
    handle->height = 0;

    if(was_window && rebuild_window){
        text_rebuild_window_texts();
    }
}

static uint8_t text_try_update_in_place_banked(TextHandle* handle, const unsigned char* text, uint8_t text_bank){
    TextMetrics metrics;
    uint8_t first_tile;
    uint8_t previous_first_tile;
    uint8_t previous_tile_count;

    if(handle == (void*)0 || handle->active == 0 || text == (void*)0){
        return 0;
    }

    if(measure_text_banked(handle->x, handle->y, text, &metrics, text_bank) == 0 ||
        metrics.tile_count == 0 ||
        metrics.x != handle->x ||
        metrics.y != handle->y ||
        metrics.width != handle->width ||
        metrics.height != handle->height ||
        metrics.tile_count != handle->tile_count
    ){
        return 0;
    }

    first_tile = register_space(&map_space_manager, metrics.tile_count);
    if(first_tile == SPACE_MANAGER_INVALID_SLOT){
        return 0;
    }

    previous_first_tile = handle->first_tile;
    previous_tile_count = handle->tile_count;

    vwf_activate_font(text_current_font);
    if(handle->layer == TEXT_LAYER_WINDOW){
        uint8_t y_offset;

        vwf_set_destination(VWF_RENDER_WIN);
        y_offset = (uint8_t)(handle->y - handle->tilemap_y);
        text_draw_vwf_y_offset_banked(handle->x, handle->y, first_tile, text, y_offset, text_bank, 1);
    } else{
        vwf_set_destination(VWF_RENDER_BKG);
        text_draw_vwf_banked(handle->x, handle->y, first_tile, text, text_bank, 1);
    }

    remove_spaces(&map_space_manager, previous_first_tile, previous_tile_count);
    handle->first_tile = first_tile;
    handle->tile_count = metrics.tile_count;
    handle->text = text;
    handle->text_bank = text_bank;
    return 1;
}

void init_text_system(void) BANKED{
    uint8_t index;

    for(index = 0; index < TEXT_MAX_ACTIVE_HANDLES; index++){
        text_active_handles[index] = (void*)0;
    }

    text_active_handle_count = 0;
    text_current_font = 0;
    vwf_load_font(0, vwf_font, BANK(vwf_font));
    vwf_activate_font(text_current_font);
}

void init_text_handle(TextHandle* handle) BANKED{
    if(handle != (void*)0){
        memset(handle, 0, sizeof(TextHandle));
    }
}

TextHandle* create_text_handle(void) BANKED{
    TextHandle* handle = (TextHandle*)malloc(sizeof(TextHandle));

    if(handle != (void*)0){
        init_text_handle(handle);
    }

    return handle;
}

void destroy_text_handle(TextHandle* handle) BANKED{
    if(handle == (void*)0){
        return;
    }

    if(handle->active){
        remove_text(handle);
    }

    free(handle);
}

uint8_t measure_text_banked(uint8_t x, uint8_t y, const unsigned char* text, TextMetrics* out, uint8_t text_bank) BANKED{
    vwf_text_metrics_t metrics;

    if(out == (void*)0 || text == (void*)0){
        return 0;
    }

    vwf_activate_font(text_current_font);
    if(vwf_measure_text_banked(x, y, text, &metrics, text_bank) == 0){
        return 0;
    }

    out->tile_count = metrics.tile_count;
    out->x = metrics.x;
    out->y = metrics.y;
    out->width = metrics.width;
    out->height = metrics.height;
    return 1;
}

uint8_t draw_text_banked(TextHandle* handle, TextLayer layer, uint8_t x, uint8_t y, const unsigned char* text, uint8_t text_bank) BANKED{
    TextMetrics metrics;
    uint8_t* saved_tiles;
    uint8_t first_tile;
    uint8_t replacing_window_text = 0;

    if(handle == (void*)0 || text == (void*)0){
        return 0;
    }

    if(handle->active && handle->layer == layer && handle->x == x && handle->y == y){
        if(text_try_update_in_place_banked(handle, text, text_bank)){
            return 1;
        }
    }

    if(handle->active){
        replacing_window_text = (handle->layer == TEXT_LAYER_WINDOW && layer == TEXT_LAYER_WINDOW);
        text_remove_handle(handle, replacing_window_text == 0);
    }

    if(measure_text_banked(x, y, text, &metrics, text_bank) == 0 || metrics.tile_count == 0 || metrics.width == 0 || metrics.height == 0){
        if(replacing_window_text){
            text_rebuild_window_texts();
        }
        return 0;
    }

    saved_tiles = (uint8_t*)malloc((uint16_t)metrics.width * metrics.height);
    if(saved_tiles == (void*)0){
        if(replacing_window_text){
            text_rebuild_window_texts();
        }
        return 0;
    }

    first_tile = register_space(&map_space_manager, metrics.tile_count);
    if(first_tile == SPACE_MANAGER_INVALID_SLOT){
        free(saved_tiles);
        if(replacing_window_text){
            text_rebuild_window_texts();
        }
        return 0;
    }

    handle->active = 1;
    handle->layer = layer;
    handle->x = metrics.x;
    handle->y = metrics.y;
    handle->tilemap_y = metrics.y;
    handle->width = metrics.width;
    handle->height = metrics.height;
    handle->saved_tiles_valid = 0;
    handle->first_tile = first_tile;
    handle->tile_count = metrics.tile_count;
    handle->saved_tiles = saved_tiles;
    handle->text = text;
    handle->text_bank = text_bank;

    if(text_register_handle(handle) == 0){
        handle->active = 0;
        remove_spaces(&map_space_manager, first_tile, metrics.tile_count);
        free(saved_tiles);
        handle->saved_tiles = (void*)0;
        if(replacing_window_text){
            text_rebuild_window_texts();
        }
        return 0;
    }

    if(layer == TEXT_LAYER_WINDOW){
        if((replacing_window_text == 0 && text_try_draw_new_window_text(handle)) == 0 && text_rebuild_window_texts() == 0){
            text_unregister_handle(handle);
            handle->active = 0;
            remove_spaces(&map_space_manager, first_tile, metrics.tile_count);
            free(saved_tiles);
            handle->saved_tiles = (void*)0;
            text_rebuild_window_texts();
            return 0;
        }
    } else{
        text_backup_tiles(handle);
        vwf_activate_font(text_current_font);
        vwf_set_destination(VWF_RENDER_BKG);
        text_draw_vwf_banked(x, y, first_tile, text, text_bank, 1);
    }

    return 1;
}

void remove_text(TextHandle* handle) BANKED{
    text_remove_handle(handle, 1);
}

uint8_t move_text(TextHandle* handle, uint8_t x, uint8_t y) BANKED{
    const unsigned char* text;
    uint8_t text_bank;
    TextLayer layer;

    if(handle == (void*)0 || handle->active == 0){
        return 0;
    }

    text = handle->text;
    text_bank = handle->text_bank;
    layer = (TextLayer)handle->layer;
    return draw_text_banked(handle, layer, x, y, text, text_bank);
}

uint8_t update_text_banked(TextHandle* handle, const unsigned char* text, uint8_t text_bank) BANKED{
    TextLayer layer;
    uint8_t x;
    uint8_t y;

    if(handle == (void*)0 || handle->active == 0 || text == (void*)0){
        return 0;
    }

    layer = (TextLayer)handle->layer;
    x = handle->x;
    y = handle->y;
    if(text_try_update_in_place_banked(handle, text, text_bank)){
        return 1;
    }
    return draw_text_banked(handle, layer, x, y, text, text_bank);
}

void clear_all_text(void) BANKED{
    while(text_active_handle_count != 0){
        remove_text(text_active_handles[text_active_handle_count - 1U]);
    }
}

void text_set_font(uint8_t font_index) BANKED{
    text_current_font = font_index;
    vwf_activate_font(font_index);
}

void text_set_colors(uint8_t fg, uint8_t bg) BANKED{
    vwf_set_colors(fg, bg);
}
