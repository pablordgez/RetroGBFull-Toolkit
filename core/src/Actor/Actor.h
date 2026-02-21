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
} Actor;



void init_actor(Actor* actor);
void set_tag(Tags tag, uint8_t index);
void set_actor_animation(Animation* animation);
void set_animation_context(void);
void draw(void);
void move_actor(int16_t dx, int16_t dy);
void set_actor_position(uint16_t x, uint16_t y);
void balanced_physics(int16_t dx, int16_t dy);
void attach_child(Actor* child);
void detach_child(Actor* child);
void set_collider(Collider* collider);


extern Actor* THIS_ACTOR;

#endif // ACTOR_H