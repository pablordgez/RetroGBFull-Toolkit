#ifndef COLLISION_MANAGER_H
#define COLLISION_MANAGER_H
#include "Collider.h"

void enable_collider(Collider* collider);
void disable_collider(Collider* collider);
void set_collision_callback(Collider* collider, RVoid_PVoid callback) BANKED;
void check_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions);
void check_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag);
void check_blocking_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions);
void check_blocking_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag);
void run_collision_callbacks(void) NONBANKED;

#endif // COLLISION_MANAGER_H
