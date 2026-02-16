#ifndef COLLIDER_REGISTRY_H
#define COLLIDER_REGISTRY_H

#include "MainDefinitions.h"

#define MAX_ACTIVE_COLLIDERS 20

typedef enum {
    BOX_COLLIDER,
    NUM_COLLIDER
} ColliderType;

extern RUInt8_PUint8 collision_check_functions[NUM_COLLIDER];

#endif