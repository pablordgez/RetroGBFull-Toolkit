#include "ColliderRegistry.h"
#include "CollisionManager.h"
#pragma bank 255

typedef void (*CollisionCallbackFunction)(void) BANKED;

Collider* active_colliders[MAX_ACTIVE_COLLIDERS];
uint8_t num_active_colliders = 0;
uint8_t DEFERRED_COLLIDER_DISABLES_PENDING;

static uint8_t collision_state[MAX_COLLISION_STATE_BYTES];
static Collider* ordered_collision_colliders[MAX_ACTIVE_COLLIDERS];

static uint16_t get_collision_state_bit(Collider* first, Collider* second){
    uint8_t first_id = first->id;
    uint8_t second_id = second->id;
    if(first_id > second_id){
        uint8_t swap = first_id;
        first_id = second_id;
        second_id = swap;
    }
    return ((uint16_t)first_id * MAX_ACTIVE_COLLIDERS) + second_id;
}

static uint8_t get_collision_state(Collider* first, Collider* second){
    uint16_t bit = get_collision_state_bit(first, second);
    return (collision_state[bit >> 3] & (1 << (bit & 7))) != 0;
}

static void set_collision_state(Collider* first, Collider* second, uint8_t value){
    uint16_t bit = get_collision_state_bit(first, second);
    uint8_t mask = 1 << (bit & 7);
    if(value){
        collision_state[bit >> 3] |= mask;
    } else{
        collision_state[bit >> 3] &= ~mask;
    }
}

static void clear_collision_states_for_collider(Collider* collider){
    uint8_t collider_id = collider->id;
    if(collider_id >= MAX_ACTIVE_COLLIDERS){
        return;
    }
    for(uint8_t i = 0; i < MAX_ACTIVE_COLLIDERS; i++){
        uint16_t row_bit = ((uint16_t)collider_id * MAX_ACTIVE_COLLIDERS) + i;
        uint16_t column_bit = ((uint16_t)i * MAX_ACTIVE_COLLIDERS) + collider_id;
        collision_state[row_bit >> 3] &= ~(1 << (row_bit & 7));
        collision_state[column_bit >> 3] &= ~(1 << (column_bit & 7));
    }
}

static uint8_t reserve_collider_id(void){
    for(uint8_t id = 0; id < MAX_ACTIVE_COLLIDERS; id++){
        uint8_t id_in_use = 0;
        for(uint8_t i = 0; i < num_active_colliders; i++){
            if(active_colliders[i] != NULL && active_colliders[i]->id == id){
                id_in_use = 1;
                break;
            }
        }
        if(!id_in_use){
            return id;
        }
    }
    return 255;
}

void flush_deferred_collider_disables(void) BANKED{
    uint8_t index = 0U;

    DEFERRED_COLLIDER_DISABLES_PENDING = 0U;
    while(index < num_active_colliders){
        if(active_colliders[index]->pending_disable){
            active_colliders[index]->pending_disable = 0U;
            disable_collider(active_colliders[index]);
        } else{
            index++;
        }
    }
}

void enable_collider(Collider* collider) BANKED{
    if(collider->pending_disable){
        collider->pending_disable = 0U;
    }
    if(collider->id != 255U){
        return;
    }
    if(num_active_colliders < MAX_ACTIVE_COLLIDERS){
        uint8_t id = reserve_collider_id();
        if(id == 255){
            return;
        }
        collider->id = id;
        active_colliders[num_active_colliders++] = collider;
    }
}

void disable_collider(Collider* collider) BANKED{
    collider->pending_disable = 0U;
    clear_collision_states_for_collider(collider);
    for(int i = 0; i < num_active_colliders; i++){
        if(active_colliders[i] == collider){
            for(int j = i; j < num_active_colliders - 1; j++){
                active_colliders[j] = active_colliders[j + 1];
            }
            num_active_colliders--;
            break;
        }
    }
    collider->id = 255;
}

void disable_collider_deferred(Collider* collider) BANKED{
    if(collider == NULL || collider->id == 255U || collider->pending_disable){
        return;
    }
    collider->pending_disable = 1U;
    DEFERRED_COLLIDER_DISABLES_PENDING = 1U;
}

void set_collision_exit_callback(Collider* collider, CollisionCallback callback) BANKED{
    if(callback == 0){
        return;
    }
    if(collider->num_collision_exit_callbacks < MAX_COLLISION_CALLBACKS){
        collider->on_collision_exit[collider->num_collision_exit_callbacks++] = callback;
    }
}

void set_collision_callback(Collider* collider, CollisionCallback callback) BANKED{
    if(callback == 0){
        return;
    }
    if(collider->num_collision_callbacks < MAX_COLLISION_CALLBACKS){
        collider->on_collision[collider->num_collision_callbacks++] = callback;
    }
}

static void invoke_collision_callbacks(Collider* this_collider, Collider* other_collider, CollisionCallback callbacks[], uint8_t num_callbacks){
    if(num_callbacks == 0){
        return;
    }

    for(uint8_t i = 0; i < num_callbacks; i++){
        if(this_collider->pending_disable || other_collider->pending_disable){
            break;
        }
        CollisionCallback callback = callbacks[i];
        if(callback == 0){
            continue;
        }

        THIS_COLLIDER = this_collider;
        OTHER_COLLIDER = other_collider;
        FAR_CALL(callback, CollisionCallbackFunction);
    }
}

static void dispatch_collision_callbacks(Collider* first_collider, Collider* second_collider){
    Collider* previous_this = THIS_COLLIDER;
    Collider* previous_other = OTHER_COLLIDER;

    invoke_collision_callbacks(
        first_collider,
        second_collider,
        first_collider->on_collision,
        first_collider->num_collision_callbacks
    );
    invoke_collision_callbacks(
        second_collider,
        first_collider,
        second_collider->on_collision,
        second_collider->num_collision_callbacks
    );

    THIS_COLLIDER = previous_this;
    OTHER_COLLIDER = previous_other;
}

static void dispatch_collision_exit_callbacks(Collider* first_collider, Collider* second_collider){
    Collider* previous_this = THIS_COLLIDER;
    Collider* previous_other = OTHER_COLLIDER;

    invoke_collision_callbacks(
        first_collider,
        second_collider,
        first_collider->on_collision_exit,
        first_collider->num_collision_exit_callbacks
    );
    invoke_collision_callbacks(
        second_collider,
        first_collider,
        second_collider->on_collision_exit,
        second_collider->num_collision_exit_callbacks
    );

    THIS_COLLIDER = previous_this;
    OTHER_COLLIDER = previous_other;
}

void check_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions) BANKED{
    uint8_t count = 0;
    for(int i = 0; i < num_active_colliders && count < max_collisions; i++){
        if(active_colliders[i] == THIS_COLLIDER) continue;
        if(active_colliders[i]->pending_disable) continue;
        OTHER_COLLIDER = active_colliders[i];
        if(check_collision()){
            out[count++] = active_colliders[i];
        }
    }
    *num_collisions = count;
}

void run_collision_callbacks(void) BANKED{
    Collider* previous_this = THIS_COLLIDER;
    Collider* previous_other = OTHER_COLLIDER;
    uint8_t num_ordered_colliders = 0;

    for(uint8_t i = 0; i < num_active_colliders; i++){
        Collider* collider = active_colliders[i];
        if(collider != NULL && !collider->pending_disable &&
            (collider->num_collision_callbacks != 0 ||
            collider->num_collision_exit_callbacks != 0)){
            ordered_collision_colliders[num_ordered_colliders++] = collider;
        }
    }
    uint8_t num_callback_owners = num_ordered_colliders;
    if(num_callback_owners == 0){
        return;
    }

    for(uint8_t i = 0; i < num_active_colliders; i++){
        Collider* collider = active_colliders[i];
        if(collider != NULL && !collider->pending_disable &&
            collider->num_collision_callbacks == 0 &&
            collider->num_collision_exit_callbacks == 0){
            ordered_collision_colliders[num_ordered_colliders++] = collider;
        }
    }

    for(uint8_t i = 0; i < num_callback_owners; i++){
        Collider* first = ordered_collision_colliders[i];
        if(first->pending_disable){
            continue;
        }

        for(uint8_t j = i + 1; j < num_ordered_colliders; j++){
            Collider* second = ordered_collision_colliders[j];
            if(first->pending_disable){
                break;
            }
            if(second->pending_disable){
                continue;
            }

            uint8_t has_collision_callbacks = first->num_collision_callbacks != 0 ||
                second->num_collision_callbacks != 0;
            uint8_t has_exit_callbacks = first->num_collision_exit_callbacks != 0 ||
                second->num_collision_exit_callbacks != 0;

            THIS_COLLIDER = first;
            OTHER_COLLIDER = second;
            if(check_collision()){
                if(has_exit_callbacks){
                    set_collision_state(first, second, 1);
                }
                if(has_collision_callbacks){
                    dispatch_collision_callbacks(first, second);
                }
            } else if(has_exit_callbacks && get_collision_state(first, second)){
                set_collision_state(first, second, 0);
                dispatch_collision_exit_callbacks(first, second);
            }
        }
    }

    THIS_COLLIDER = previous_this;
    OTHER_COLLIDER = previous_other;
}

void check_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag) BANKED{
    uint8_t count = 0;
    for(int i = 0; i < num_active_colliders && count < max_collisions; i++){
        if(active_colliders[i] == THIS_COLLIDER) continue;
        if(active_colliders[i]->pending_disable) continue;
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


void check_blocking_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions) BANKED{
    uint8_t count = 0;
    for(int i = 0; i < num_active_colliders && count < max_collisions; i++){
        if(active_colliders[i] == THIS_COLLIDER) continue;
        if(active_colliders[i]->pending_disable) continue;
        OTHER_COLLIDER = active_colliders[i];
        if(active_colliders[i]->is_blocking && check_collision()){
            out[count++] = active_colliders[i];
        }
    }
    *num_collisions = count;
}

void check_blocking_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag) BANKED{
    uint8_t count = 0;
    for(int i = 0; i < num_active_colliders && count < max_collisions; i++){
        if(active_colliders[i] == THIS_COLLIDER) continue;
        if(active_colliders[i]->pending_disable) continue;
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
