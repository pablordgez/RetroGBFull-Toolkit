#ifndef ANIMATION_REGISTRY_H
#define ANIMATION_REGISTRY_H
#include "Assets/SpaceManager.h"
#include "Animation.h"

typedef enum {
    NUMBER_OF_ANIMATIONS = 1
} AnimationType;

extern const Animation* animations[NUMBER_OF_ANIMATIONS];
extern const AssetEntry animation_data[NUMBER_OF_ANIMATIONS];

#endif /* ANIMATION_REGISTRY_H */
