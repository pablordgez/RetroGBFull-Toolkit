#ifndef BOX_COLLIDER_H
#define BOX_COLLIDER_H

#include "Collider.h"
#include "ColliderRegistry.h"
#include <stdint.h>

typedef struct {
    Collider base;
    uint8_t width, height;
} BoxCollider;


#endif /* BOX_COLLIDER_H */