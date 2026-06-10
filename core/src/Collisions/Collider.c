#include "Collider.h"
#include "ColliderRegistry.h"
#include "BoxCollider.h"
Collider* THIS_COLLIDER;
Collider* OTHER_COLLIDER;

uint8_t check_collision(void){
    if(THIS_COLLIDER->type == BOX_COLLIDER){
        if(OTHER_COLLIDER->type == BOX_COLLIDER){
            BoxCollider* a = (BoxCollider*) THIS_COLLIDER;
            BoxCollider* b = (BoxCollider*) OTHER_COLLIDER;
            int16_t ax = (int16_t)a->base.x;
            int16_t ay = (int16_t)a->base.y;
            int16_t bx = (int16_t)b->base.x;
            int16_t by = (int16_t)b->base.y;

            if(ax + (int16_t)a->base.width > bx && ax < bx + (int16_t)b->base.width &&
                ay + (int16_t)a->base.height > by && ay < by + (int16_t)b->base.height){
                    return 1;
            }
        }
    }
    return 0;
}
