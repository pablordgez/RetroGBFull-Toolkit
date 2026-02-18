#ifndef COLLIDER_H
#define COLLIDER_H
#include <stdint.h>
#include "Actor/ActorRegistry.h"
#include "BoxCollider.h"
#include "CapsuleCollider.h"

typedef struct {
    uint16_t x;
    uint16_t y;
    uint8_t type;
    uint8_t id;
    uint8_t is_blocking;
    Tags tags[5];
} Collider;

extern Collider* THIS_COLLIDER;
extern Collider* OTHER_COLLIDER;

uint8_t check_collision();

#endif // COLLIDER_H