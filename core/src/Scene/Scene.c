#pragma bank 255
#include "Scene.h"
#include <stdio.h>
#include "Camera/Camera.h"
#include "Interrupts/InterruptManager.h"

Scene* THIS_SCENE;
typedef enum {
    WINDOW_SPLIT_DISABLED = 0,
    WINDOW_SPLIT_TOP_ONLY,
    WINDOW_SPLIT_TOP_AND_BOTTOM
} WindowSplitMode;

static WindowSplitMode window_split_mode = WINDOW_SPLIT_DISABLED;
static uint8_t window_split_stage = 0;
static uint8_t window_split_hide_ly = 0;
static uint8_t window_split_show_ly = 0;

static void window_split_lcd_isr(void) NONBANKED{
    if(window_split_mode == WINDOW_SPLIT_DISABLED) return;

    if(window_split_mode == WINDOW_SPLIT_TOP_ONLY){
        if(window_split_stage == 0){
            HIDE_WIN;
            window_split_stage = 2;
        }
        return;
    }
    if(window_split_stage == 0){
        HIDE_WIN;
        window_split_stage = (window_split_show_ly < SCREEN_HEIGHT) ? 1 : 2;
    } else if(window_split_stage == 1){
        SHOW_WIN;
        window_split_stage = 2;
    }
}

static void window_split_vbl_isr(void) NONBANKED{
    if(window_split_mode == WINDOW_SPLIT_DISABLED) return;

    WY_REG = 0;
    window_split_stage = 0;

    SHOW_WIN;
}

static void configure_window_split(Map* map) BANKED{
    uint8_t top_end;
    uint8_t bottom_start;
    uint16_t top_ly;
    uint16_t bottom_ly;

    if(map == NULL){
        window_split_mode = WINDOW_SPLIT_DISABLED;
        window_split_stage = 0;
        clear_lcd_scanline_interrupts();
        remove_vblank_interrupt_callback(window_split_vbl_isr);
        HIDE_WIN;
        return;
    }

    top_end = map->window_top_end;
    bottom_start = map->window_bottom_start;
    top_ly = ((uint16_t)top_end) << 3;
    bottom_ly = ((uint16_t)bottom_start) << 3;

    if(top_end == 0 && bottom_start == 0){
        window_split_mode = WINDOW_SPLIT_DISABLED;
        window_split_stage = 0;
        clear_lcd_scanline_interrupts();
        remove_vblank_interrupt_callback(window_split_vbl_isr);
        SHOW_WIN;
        return;
    }
    if(top_end > 0 && bottom_start == 0 && top_ly < SCREEN_HEIGHT){
        window_split_mode = WINDOW_SPLIT_TOP_ONLY;
        window_split_hide_ly = (uint8_t)top_ly;
    }
    else if(top_end > 0 && bottom_start > top_end && top_ly < SCREEN_HEIGHT){
        window_split_mode = WINDOW_SPLIT_TOP_AND_BOTTOM;
        window_split_hide_ly = (uint8_t)top_ly;
        window_split_show_ly = (bottom_ly < SCREEN_HEIGHT) ? (uint8_t)bottom_ly : 255;
    }
    else{
        window_split_mode = WINDOW_SPLIT_DISABLED;
        window_split_stage = 0;
        clear_lcd_scanline_interrupts();
        remove_vblank_interrupt_callback(window_split_vbl_isr);
        SHOW_WIN;
        return;
    }

    clear_lcd_scanline_interrupts();
    add_vblank_interrupt_callback(window_split_vbl_isr);

    add_lcd_scanline_interrupt(window_split_hide_ly, window_split_lcd_isr);
    if(window_split_mode == WINDOW_SPLIT_TOP_AND_BOTTOM && window_split_show_ly < SCREEN_HEIGHT){
        add_lcd_scanline_interrupt(window_split_show_ly, window_split_lcd_isr);
    }

    window_split_stage = 0;
    WY_REG = 0;
    SHOW_WIN;
}

void init_scene(Scene* scene) BANKED{
    scene->num_actors = 0;
    scene->actors = NULL;
    scene->map = NULL;
    scene->window = NULL;
}

void add_actor(Actor* actor) BANKED{
    Actor** next_actors = realloc(THIS_SCENE->actors, sizeof(Actor*) * (THIS_SCENE->num_actors + 1));
    if(next_actors == NULL){
        destroy_actor(actor);
        return;
    }
    THIS_SCENE->actors = next_actors;
    THIS_SCENE->actors[THIS_SCENE->num_actors++] = actor;
}

void remove_actor(Actor* actor) BANKED{
    for(int i = 0; i < THIS_SCENE->num_actors; i++){
        if(THIS_SCENE->actors[i] == actor){
            for(int j = i; j < THIS_SCENE->num_actors - 1; j++){
                THIS_SCENE->actors[j] = THIS_SCENE->actors[j + 1];
            }
            THIS_SCENE->num_actors--;
            destroy_actor(actor);
            if(THIS_SCENE->num_actors == 0){
                free(THIS_SCENE->actors);
                THIS_SCENE->actors = NULL;
            } else{
                Actor** next_actors = realloc(THIS_SCENE->actors, sizeof(Actor*) * THIS_SCENE->num_actors);
                if(next_actors != NULL){
                    THIS_SCENE->actors = next_actors;
                }
            }
            break;
        }
    }
}

void update_actors(void) NONBANKED{
    for(int i = 0; i < THIS_SCENE->num_actors; i++){
        THIS_ACTOR = THIS_SCENE->actors[i];
        actor_update_functions[THIS_ACTOR->type]();
        if(THIS_ACTOR->followed){
            update_camera(THIS_ACTOR->x, THIS_ACTOR->y);
        }
    }
}

void draw_actors(void) NONBANKED {
    for(int i = 0; i < THIS_SCENE->num_actors; i++){ 
        THIS_ACTOR = THIS_SCENE->actors[i]; 
        draw(); 
    }
}

void get_actors_by_tag(Tags tag, Actor* result[], uint8_t result_limit, uint8_t* out_count) BANKED{
    uint8_t count = 0;
    for(int i = 0; i < THIS_SCENE->num_actors && count < result_limit; i++){
        for(int j = 0; j < 5; j++){
            if(THIS_SCENE->actors[i]->tags[j] == tag){
                result[count++] = THIS_SCENE->actors[i];
                break;
            }
        }
    }
    *out_count = count;
}

void cleanup_scene(Scene* scene) BANKED{
    THIS_SCENE = scene;
    for(int i = 0; i < scene->num_actors; i++){
        destroy_actor(scene->actors[i]);
    }
    free(scene->actors);
    scene->actors = NULL;
    scene->num_actors = 0;
    set_scene_map(NULL);
    set_scene_window(NULL);
    free(scene);
}

void set_scene_map(Map* map) NONBANKED{
    if(THIS_SCENE->map != NULL){
        unload_map();
    }
    THIS_SCENE->map = map;
    THIS_MAP = map;
    if(THIS_SCENE->map != NULL){
        load_map(0);
    }
}

void set_scene_window(Map* map) NONBANKED{
    if(THIS_SCENE->window != NULL){
        THIS_MAP = THIS_SCENE->window;
        unload_map();
    }
    THIS_SCENE->window = map;
    THIS_MAP = map;
    if(THIS_SCENE->window != NULL){
        load_map(1);
    }
    configure_window_split(THIS_SCENE->window);
    if(THIS_SCENE->map != NULL){
        THIS_MAP = THIS_SCENE->map;
    }
}
