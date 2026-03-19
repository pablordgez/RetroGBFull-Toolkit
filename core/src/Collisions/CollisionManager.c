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

void set_collision_callback(Collider* collider, RVoid_PVoid callback) BANKED{
    if(callback == NULL){
        return;
    }
    if(collider->num_collision_callbacks < MAX_COLLISION_CALLBACKS){
        collider->on_collision[collider->num_collision_callbacks++] = callback;
    }
}

static void invoke_collision_callback(Collider* this_collider, Collider* other_collider) NONBANKED{
    if(this_collider->num_collision_callbacks == 0){
        return;
    }

    for(uint8_t i = 0; i < this_collider->num_collision_callbacks; i++){
        RVoid_PVoid callback = this_collider->on_collision[i];
        if(callback == NULL){
            continue;
        }

        THIS_COLLIDER = this_collider;
        OTHER_COLLIDER = other_collider;
        callback();
    }
}

static void dispatch_collision_callbacks(Collider* first_collider, Collider* second_collider) NONBANKED{
    Collider* previous_this = THIS_COLLIDER;
    Collider* previous_other = OTHER_COLLIDER;

    invoke_collision_callback(first_collider, second_collider);
    invoke_collision_callback(second_collider, first_collider);

    THIS_COLLIDER = previous_this;
    OTHER_COLLIDER = previous_other;
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

void run_collision_callbacks(void) NONBANKED{
    Collider* previous_this = THIS_COLLIDER;
    Collider* previous_other = OTHER_COLLIDER;

    for(int i = 0; i < num_active_colliders; i++){
        Collider* first = active_colliders[i];
        if(first == NULL){
            continue;
        }

        for(int j = i + 1; j < num_active_colliders; j++){
            Collider* second = active_colliders[j];
            if(second == NULL){
                continue;
            }
            if(first->num_collision_callbacks == 0 && second->num_collision_callbacks == 0){
                continue;
            }

            THIS_COLLIDER = first;
            OTHER_COLLIDER = second;
            if(check_collision()){
                dispatch_collision_callbacks(first, second);
            }
        }
    }

    THIS_COLLIDER = previous_this;
    OTHER_COLLIDER = previous_other;
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
            dispatch_collision_callbacks(THIS_COLLIDER, OTHER_COLLIDER);
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
                dispatch_collision_callbacks(THIS_COLLIDER, OTHER_COLLIDER);
                out[count++] = active_colliders[i];
                break;
            }
        }
    }
    *num_collisions = count;
}
