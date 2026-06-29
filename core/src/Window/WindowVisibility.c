#pragma bank 255
#include "WindowVisibility.h"
#include "Interrupts/InterruptManager.h"
#include "MainDefinitions.h"

typedef struct {
    uint8_t owner;
    uint8_t start_ly;
    uint8_t end_ly;
} WindowVisibilityBand;

static WindowVisibilityBand window_visibility_bands[WINDOW_VISIBILITY_MAX_BANDS];
static WindowVisibilityBand window_visibility_merged_bands[WINDOW_VISIBILITY_MAX_BANDS];
static uint8_t window_visibility_band_count = 0;
static uint8_t window_visibility_merged_count = 0;

// Hardware WX is biased by 7 pixels: WX_REG 7 places the window at screen X 0.
#define WINDOW_VISIBILITY_VISIBLE_WX 7
#define WINDOW_VISIBILITY_HIDDEN_WX 255
#define WINDOW_VISIBILITY_STAT_MODE_MASK 0x03U

static void window_visibility_vblank_isr(void) NONBANKED{
    if(window_visibility_merged_count != 0){
        WY_REG = window_visibility_merged_bands[0].start_ly;
        WX_REG = WINDOW_VISIBILITY_VISIBLE_WX;
        SHOW_WIN;
    } else{
        WY_REG = 0;
        HIDE_WIN;
    }
}

static void window_visibility_wait_for_hblank(void) NONBANKED{
    while((STAT_REG & WINDOW_VISIBILITY_STAT_MODE_MASK) != STATF_HBL){
    }
}

static void window_visibility_show_isr(void) NONBANKED{
    window_visibility_wait_for_hblank();
    WX_REG = WINDOW_VISIBILITY_VISIBLE_WX;
}

static void window_visibility_hide_isr(void) NONBANKED{
    window_visibility_wait_for_hblank();
    WX_REG = WINDOW_VISIBILITY_HIDDEN_WX;
}

static void window_visibility_clear_interrupts(void){
    clear_lcd_scanline_interrupts_for_callback(window_visibility_show_isr);
    clear_lcd_scanline_interrupts_for_callback(window_visibility_hide_isr);
    remove_vblank_interrupt_callback(window_visibility_vblank_isr);
}

void init_window_visibility_system(void) BANKED{
    window_visibility_band_count = 0;
    window_visibility_merged_count = 0;
    window_visibility_clear_interrupts();
    WX_REG = WINDOW_VISIBILITY_HIDDEN_WX;
    WY_REG = 0;
    HIDE_WIN;
}

void window_visibility_clear_owner(uint8_t owner) BANKED{
    uint8_t index = 0;

    while(index < window_visibility_band_count){
        if(window_visibility_bands[index].owner == owner){
            uint8_t shift_index;

            for(shift_index = index; shift_index + 1U < window_visibility_band_count; shift_index++){
                window_visibility_bands[shift_index] = window_visibility_bands[shift_index + 1U];
            }

            window_visibility_band_count--;
            window_visibility_bands[window_visibility_band_count].owner = 0;
            window_visibility_bands[window_visibility_band_count].start_ly = 0;
            window_visibility_bands[window_visibility_band_count].end_ly = 0;
        } else{
            index++;
        }
    }
}

uint8_t window_visibility_add_band(uint8_t owner, uint8_t start_ly, uint8_t end_ly) BANKED{
    uint8_t insert_index;
    uint8_t shift_index;

    if(owner == 0 || start_ly >= SCREEN_HEIGHT || start_ly >= end_ly){
        return 0;
    }

    if(end_ly > SCREEN_HEIGHT){
        end_ly = SCREEN_HEIGHT;
    }

    if(window_visibility_band_count >= WINDOW_VISIBILITY_MAX_BANDS){
        return 0;
    }

    insert_index = 0;
    while(insert_index < window_visibility_band_count && window_visibility_bands[insert_index].start_ly <= start_ly){
        insert_index++;
    }

    shift_index = window_visibility_band_count;
    while(shift_index != insert_index){
        window_visibility_bands[shift_index] = window_visibility_bands[shift_index - 1U];
        shift_index--;
    }

    window_visibility_bands[insert_index].owner = owner;
    window_visibility_bands[insert_index].start_ly = start_ly;
    window_visibility_bands[insert_index].end_ly = end_ly;
    window_visibility_band_count++;
    return 1;
}

static void window_visibility_merge_bands(void){
    uint8_t source_index;

    window_visibility_merged_count = 0;

    for(source_index = 0; source_index < window_visibility_band_count; source_index++){
        WindowVisibilityBand* source = &window_visibility_bands[source_index];

        if(window_visibility_merged_count == 0){
            window_visibility_merged_bands[0] = *source;
            window_visibility_merged_count = 1;
        } else{
            WindowVisibilityBand* current = &window_visibility_merged_bands[window_visibility_merged_count - 1U];

            if(source->start_ly <= current->end_ly){
                if(source->end_ly > current->end_ly){
                    current->end_ly = source->end_ly;
                }
            } else if(window_visibility_merged_count < WINDOW_VISIBILITY_MAX_BANDS){
                window_visibility_merged_bands[window_visibility_merged_count] = *source;
                window_visibility_merged_count++;
            }
        }
    }
}

static uint8_t window_visibility_hblank_transition_ly(uint8_t target_ly) NONBANKED{
    return target_ly > 1U ? (uint8_t)(target_ly - 2U) : 0;
}

uint8_t window_visibility_apply(void) BANKED{
    uint8_t band_index;

    window_visibility_clear_interrupts();
    window_visibility_merge_bands();

    if(window_visibility_merged_count == 0){
        HIDE_WIN;
        return 1;
    }

    add_vblank_interrupt_callback(window_visibility_vblank_isr);

    for(band_index = 0; band_index < window_visibility_merged_count; band_index++){
        WindowVisibilityBand* band = &window_visibility_merged_bands[band_index];

        if(
            band_index != 0 &&
            add_lcd_scanline_interrupt(
                window_visibility_hblank_transition_ly(band->start_ly),
                window_visibility_show_isr
            ) == 0
        ){
            window_visibility_clear_interrupts();
            HIDE_WIN;
            return 0;
        }

        if(
            band->end_ly < SCREEN_HEIGHT &&
            add_lcd_scanline_interrupt(
                window_visibility_hblank_transition_ly(band->end_ly),
                window_visibility_hide_isr
            ) == 0
        ){
            window_visibility_clear_interrupts();
            HIDE_WIN;
            return 0;
        }
    }

    WY_REG = window_visibility_merged_bands[0].start_ly;
    WX_REG = WINDOW_VISIBILITY_VISIBLE_WX;
    SHOW_WIN;

    return 1;
}

uint8_t window_visibility_get_tile_row_for_screen_y(uint8_t screen_ly) BANKED{
    uint8_t band_index;
    uint8_t visible_lines = 0;

    window_visibility_merge_bands();

    for(band_index = 0; band_index < window_visibility_merged_count; band_index++){
        WindowVisibilityBand* band = &window_visibility_merged_bands[band_index];

        if(screen_ly >= band->end_ly){
            visible_lines += (uint8_t)(band->end_ly - band->start_ly);
        } else if(screen_ly > band->start_ly){
            visible_lines += (uint8_t)(screen_ly - band->start_ly);
            break;
        } else{
            break;
        }
    }

    return visible_lines >> 3;
}
