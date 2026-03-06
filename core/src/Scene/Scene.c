#pragma bank 255
#include "Scene.h"
#include <stdio.h>
#include "Camera/Camera.h"

Scene* THIS_SCENE;

void init_scene(Scene* scene) BANKED{
    scene->num_actors = 0;
    scene->actors = NULL;
    scene->map = NULL;
    scene->window = NULL;
}

void add_actor(Actor* actor) BANKED{
    THIS_SCENE->actors = realloc(THIS_SCENE->actors, sizeof(Actor*) * (THIS_SCENE->num_actors + 1));
    THIS_SCENE->actors[THIS_SCENE->num_actors++] = actor;
}

void remove_actor(Actor* actor) BANKED{
    for(int i = 0; i < THIS_SCENE->num_actors; i++){
        if(THIS_SCENE->actors[i] == actor){
            for(int j = i; j < THIS_SCENE->num_actors - 1; j++){
                THIS_SCENE->actors[j] = THIS_SCENE->actors[j + 1];
            }
            THIS_SCENE->num_actors--;
            THIS_SCENE->actors = realloc(THIS_SCENE->actors, sizeof(Actor*) * THIS_SCENE->num_actors);
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
    if(THIS_SCENE->map != NULL){
        THIS_MAP = THIS_SCENE->map;
    }
}

