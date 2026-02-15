#ifndef ANIMATION_REGISTRY_H
#define ANIMATION_REGISTRY_H
#include "Assets/SpaceManager.h"
#include "Animation.h"

#include "animationsample1/animationsample1.h"
#include "animationsample2/animationsample2.h"


// name, width, height, frames, frame duration
#define ANIMATIONS \
    _ANIMATION(animationsample1, 8, 8, 1, 60, (void*) 0) \
    _ANIMATION(animationsample2, 16, 16, 2, 30, animationsample2_metasprite_data)


#define _ANIMATION(name, width, height, frames, duration, metasprite) name,
    typedef enum {
        ANIMATIONS
        NUMBER_OF_ANIMATIONS
    } AnimationType;
#undef _ANIMATION

extern const Animation* animations[];
extern const AssetEntry animation_data[];


#endif /* ANIMATION_REGISTRY_H */