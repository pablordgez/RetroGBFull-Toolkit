#include "Collider.h"
#include "ColliderRegistry.h"
Collider* THIS_COLLIDER;
Collider* OTHER_COLLIDER;

uint8_t check_collision(){
    if(THIS_COLLIDER->type == BOX_COLLIDER){
        if(OTHER_COLLIDER->type == BOX_COLLIDER){
            BoxCollider* a = (BoxCollider*) THIS_COLLIDER;
            BoxCollider* b = (BoxCollider*) OTHER_COLLIDER;

            if(a->base.x + a->base.width > b->base.x && a->base.x < b->base.x + b->base.width &&
                a->base.y + a->base.height > b->base.y && a->base.y < b->base.y + b->base.height){
                    return 1;
            }
        }
    }
    return 0;
}