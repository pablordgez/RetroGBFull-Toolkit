#include "ColliderRegistry.h"
#include "CollisionManager.h"

Collider* active_colliders[MAX_ACTIVE_COLLIDERS];
uint8_t num_active_colliders = 0;

void enable_collider(Collider* collider){
    if(num_active_colliders < MAX_ACTIVE_COLLIDERS){
        active_colliders[num_active_colliders++] = collider;
    }
}

void disable_collider(Collider* collider){
    for(int i = 0; i < num_active_colliders; i++){
        if(active_colliders[i] == collider){
            for(int j = i; j < num_active_colliders - 1; j++){
                active_colliders[j] = active_colliders[j + 1];
            }
            num_active_colliders--;
            break;
        }
    }
}

void check_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions){
    uint8_t count = 0;
    for(int i = 0; i < num_active_colliders && count < max_collisions; i++){
        if(active_colliders[i] == THIS_COLLIDER) continue;
        OTHER_COLLIDER = active_colliders[i];
        if(check_collision()){
            out[count++] = active_colliders[i];
        }
    }
    *num_collisions = count;
}

void check_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag){
    uint8_t count = 0;
    for(int i = 0; i < num_active_colliders && count < max_collisions; i++){
        if(active_colliders[i] == THIS_COLLIDER) continue;
        OTHER_COLLIDER = active_colliders[i];
        for(uint8_t _tag = 0; _tag < 5; _tag++){
            if(OTHER_COLLIDER->tags[_tag] == tag && check_collision()){
                out[count++] = active_colliders[i];
                break;
            }
        }
    }
    *num_collisions = count;
}


void check_blocking_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions){
    uint8_t count = 0;
    for(int i = 0; i < num_active_colliders && count < max_collisions; i++){
        if(active_colliders[i] == THIS_COLLIDER) continue;
        OTHER_COLLIDER = active_colliders[i];
        if(active_colliders[i]->is_blocking && check_collision()){
            out[count++] = active_colliders[i];
        }
    }
    *num_collisions = count;
}

void check_blocking_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag){
    uint8_t count = 0;
    for(int i = 0; i < num_active_colliders && count < max_collisions; i++){
        if(active_colliders[i] == THIS_COLLIDER) continue;
        OTHER_COLLIDER = active_colliders[i];
        for(uint8_t _tag = 0; _tag < 5; _tag++){
            if(OTHER_COLLIDER->tags[_tag] == tag && OTHER_COLLIDER->is_blocking && check_collision()){
                out[count++] = active_colliders[i];
                break;
            }
        }
    }
    *num_collisions = count;
}