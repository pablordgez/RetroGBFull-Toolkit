#include <gb/gb.h>
#include <stdint.h>
#include "Assets/Animations/AnimationRegistry.h"
#include "GameManager/GameManager.h"
#include "Scene/SceneRegistry.h"
#include "CustomScenes/SampleScene.h"


void main(void)
{
    init_actor_functions();
    init_scene_functions();
    init_animation_system();

    GameManager gm;
    THIS_GAME_MANAGER = &gm;
    gm.current_scene = NULL;

    SampleScene ss;
    ss.base.type = _SampleScene;

    set_scene((Scene*) &ss);

    DISPLAY_ON;
    SHOW_BKG;
    SHOW_SPRITES;
    
    while(1) {
        update_game();



        vsync();
    }
}
