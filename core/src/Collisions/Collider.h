#ifndef COLLIDER_H
#define COLLIDER_H
#include <stdint.h>
#include <gbdk/far_ptr.h>
#include "Actor/ActorRegistry.h"
#include "ColliderRegistry.h"

struct Actor;

typedef FAR_PTR CollisionCallback;

typedef struct {
    uint16_t x;
    uint16_t y;
    uint8_t type;
    uint8_t id;
    uint8_t is_blocking;
    uint16_t width;
    uint16_t height;
    Tags tags[5];
    CollisionCallback on_collision[MAX_COLLISION_CALLBACKS];
    CollisionCallback on_collision_exit[MAX_COLLISION_CALLBACKS];
    uint8_t num_collision_callbacks;
    uint8_t num_collision_exit_callbacks;
    struct Actor* parent;
} Collider;

extern Collider* THIS_COLLIDER;
extern Collider* OTHER_COLLIDER;

uint8_t check_collision(void);

#endif // COLLIDER_H
