#ifndef COLLISION_MANAGER_H
#define COLLISION_MANAGER_H
#include "Collider.h"

void enable_collider(Collider* collider);
void disable_collider(Collider* collider);
void check_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions);
void check_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag);
void check_blocking_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions);
void check_blocking_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag);

#endif // COLLISION_MANAGER_H