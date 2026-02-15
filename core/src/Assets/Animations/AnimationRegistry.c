#include "AnimationRegistry.h"

#define _ANIMATION(name, _width, _height, frames, duration, _metasprite) \
    const Animation _##name = { \
        .animation_id = name, \
        .width = _width, \
        .height = _height, \
        .number_of_frames = frames, \
        .frame_duration = duration, \
        .metasprite = _metasprite \
    };
ANIMATIONS
#undef _ANIMATION

#define _ANIMATION(name, _width, _height, _frames, _duration, _metasprite) \
        [name] = &_##name,
    const Animation* animations[]= {
    ANIMATIONS
    };
#undef _ANIMATION 

#define _ANIMATION(name, width, height, frames, duration, metasprite) \
BANKREF_EXTERN(name##_bankref)
ANIMATIONS
#undef _ANIMATION

#define _ANIMATION(name, width, height, frames, duration, metasprite) \
    [name] = {BANK(name##_bankref), name##_sprite_data},
const AssetEntry animation_data[] = {
    ANIMATIONS
};
#undef _ANIMATION


