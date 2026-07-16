#pragma bank 255
#include "Scene.h"
#include <stdio.h>
#include "Camera/Camera.h"
#include "Assets/Text/Text.h"
#include "Window/WindowVisibility.h"

Scene* THIS_SCENE;

/* Internal fixed-point map bounds used by actor movement. */
uint8_t actor_map_bounds_active;
uint16_t actor_map_max_x;
uint16_t actor_map_max_y;

static void configure_window_visibility(Map* map){
    window_visibility_clear_owner(WINDOW_VISIBILITY_OWNER_SCENE);

    if(map == NULL){
        window_visibility_apply();
        return;
    }

    window_visibility_add_band(WINDOW_VISIBILITY_OWNER_SCENE, 0, SCREEN_HEIGHT);
    window_visibility_apply();
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
        FAR_CALL(actor_update_functions[THIS_ACTOR->type], RVoid_PVoid_BANKED);
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
    clear_all_text();
    set_scene_map(NULL);
    set_scene_window(NULL);
    free(scene);
}

void set_scene_map(Map* map) BANKED{
    if(THIS_SCENE->map != NULL){
        unload_map();
    }
    THIS_MAP = NULL;
    clear_changed_map_tiles();
    THIS_SCENE->map = map;
    THIS_MAP = map;
    if(THIS_SCENE->map != NULL){
        actor_map_max_x = ((THIS_SCENE->map->width << 3) + 7u) << 4;
        actor_map_max_y = ((THIS_SCENE->map->height << 3) + 15u) << 4;
        actor_map_bounds_active = 1;
        load_map(0);
    } else{
        actor_map_bounds_active = 0;
    }
}

void set_scene_window(Map* map) BANKED{
    if(THIS_SCENE->window != NULL){
        THIS_MAP = THIS_SCENE->window;
        unload_map();
    }
    THIS_SCENE->window = map;
    THIS_MAP = map;
    if(THIS_SCENE->window != NULL){
        load_map(1);
    }
    configure_window_visibility(THIS_SCENE->window);
    if(THIS_SCENE->map != NULL){
        THIS_MAP = THIS_SCENE->map;
    }
}
