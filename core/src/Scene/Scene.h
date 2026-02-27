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
} Scene;

void init_scene(Scene* scene);
void add_actor(Actor* actor);
void remove_actor(Actor* actor);
void update_actors(void);
void draw_actors(void);
void get_actors_by_tag(Tags tag, Actor* result[], uint8_t result_limit, uint8_t* out_count);
void cleanup_scene(Scene* scene);
void set_scene_map(Map* map);

extern Scene* THIS_SCENE;
#endif // SCENE_H