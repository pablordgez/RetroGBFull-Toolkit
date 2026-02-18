#ifndef COLLIDER_REGISTRY_H
#define COLLIDER_REGISTRY_H

#include "MainDefinitions.h"

#define MAX_ACTIVE_COLLIDERS 20

typedef enum {
    BOX_COLLIDER,
    CAPSULE_COLLIDER,
    NUM_COLLIDER
} ColliderType;


#endif