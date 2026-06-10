#ifndef ACTOR_H
#define ACTOR_H
#include "ActorRegistry.h"
#include "Assets/Animations/Animation.h"
#include <string.h>
#include <stdint.h>
#include <stdlib.h>
#include "Collisions/Collider.h"
#include "Collisions/CollisionManager.h"

typedef enum {
    HIGH_PERF,
    BALANCED,
    HIGH_FIDELITY
} PhysicsMode;

typedef struct Actor {
    ActorType type;
    Tags tags[5];
    Animation* current_animation;
    AnimationState* animation_state;
    uint16_t x; uint16_t y;
    Collider* collider;
    struct Actor* child;
    struct Actor* sibling;
    struct Actor* parent;
    PhysicsMode physics_mode;
    uint8_t followed;
} Actor;



void init_actor(Actor* actor) BANKED;
void set_tag(Tags tag, uint8_t index) BANKED;
void set_actor_animation(Animation* animation) NONBANKED;
void set_animation_context(void) BANKED;
void draw(void) NONBANKED;
void move_actor(int16_t dx, int16_t dy) BANKED;
void set_actor_position(uint16_t x, uint16_t y) BANKED;
void balanced_physics(int16_t dx, int16_t dy) BANKED;
void attach_child(Actor* child) BANKED;
void detach_child(Actor* child) BANKED;
void set_collider(Collider* collider) BANKED;
void destroy_actor(Actor* actor) BANKED;


extern Actor* THIS_ACTOR;

#endif // ACTOR_H
