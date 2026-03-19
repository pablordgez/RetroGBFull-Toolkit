#ifndef COLLIDER_H
#define COLLIDER_H
#include <stdint.h>
#include "Actor/ActorRegistry.h"
#include "ColliderRegistry.h"

typedef struct {
    uint16_t x;
    uint16_t y;
    uint8_t type;
    uint8_t id;
    uint8_t is_blocking;
    uint16_t width;
    uint16_t height;
    Tags tags[5];
    RVoid_PVoid on_collision[MAX_COLLISION_CALLBACKS];
    uint8_t num_collision_callbacks;
} Collider;

extern Collider* THIS_COLLIDER;
extern Collider* OTHER_COLLIDER;

uint8_t check_collision(void);

#endif // COLLIDER_H
