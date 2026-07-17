#ifndef SCENE_H
#define SCENE_H
#include "Actor/Actor.h"
#include "Assets/Map/Map.h"
#include "Assets/Map/MapRegistry.h"
#include "SceneRegistry.h"
#include <stdint.h>
#include <stdlib.h>
typedef struct Scene {
    Actor** actors;
    uint8_t num_actors;
    SceneType type;
    Map* map;
    Map* window;
    uint8_t collision_callbacks_30hz;
} Scene;

void init_scene(Scene* scene) BANKED;
void add_actor(Actor* actor) BANKED;
void remove_actor(Actor* actor) BANKED;
void remove_actor_deferred(Actor* actor) BANKED;
void update_actors(void) NONBANKED;
void draw_actors(void) NONBANKED;
void flush_deferred_actor_removals(void) BANKED;
void get_actors_by_tag(Tags tag, Actor* result[], uint8_t result_limit, uint8_t* out_count) BANKED;
void cleanup_scene(Scene* scene) BANKED;
void set_scene_map(Map* map) BANKED;
void set_scene_window(Map* map) BANKED;

extern Scene* THIS_SCENE;
extern uint8_t DEFERRED_ACTOR_REMOVALS_PENDING;
#endif // SCENE_H
