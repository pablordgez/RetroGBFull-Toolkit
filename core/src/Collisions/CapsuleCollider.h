#ifndef CAPSULE_COLLIDER_H
#define CAPSULE_COLLIDER_H

#include "Collider.h"
#include "ColliderRegistry.h"
#include <stdint.h>

typedef struct {
    Collider base;
    uint8_t radiusX, radiusY;
} CapsuleCollider;



#endif /* CAPSULE_COLLIDER_H */