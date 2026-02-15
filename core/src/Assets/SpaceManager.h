#ifndef SPACE_MANAGER_H
#define SPACE_MANAGER_H
#include <stdint.h>
#include <stdlib.h>
typedef struct {
    uint8_t bank;
    uint8_t* data;
} AssetEntry;

typedef struct{
    uint8_t* spaces;
    uint8_t total_spaces;
} SpaceManager;

void init_space_manager(SpaceManager* manager, uint8_t num_spaces);
uint8_t register_space(SpaceManager* manager, uint8_t size);
void remove_spaces(SpaceManager* manager, uint8_t slot, uint8_t size);

#endif /* SPACE_MANAGER_H */