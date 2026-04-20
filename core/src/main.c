#include <gb/gb.h>
#include <stdint.h>
#include "Assets/Animations/AnimationRegistry.h"
#include "GameManager/GameManager.h"
#include "Saves/SaveData.h"
#include "Interrupts/InterruptManager.h"
#include "Scene/SceneRegistry.h"
// BEGIN STARTING SCENE INCLUDE
#include "CustomScenes/SampleScene.h"
// END STARTING SCENE INCLUDE

SaveData save_data;

static void engine_idle_vblank_isr(void) NONBANKED{
}

void main(void)
{
    init_actor_functions();
    init_scene_functions();
    init_animation_system();
    init_map_system();
    init_interrupt_manager();
    add_vblank_interrupt_callback(engine_idle_vblank_isr);
    load_save_data();

    GameManager gm;
    THIS_GAME_MANAGER = &gm;
    gm.current_scene = NULL;

    // BEGIN STARTING SCENE INSTANTIATION
    SampleScene ss;
    ss.base.type = _SampleScene;

    set_scene((Scene*) &ss);
    // END STARTING SCENE INSTANTIATION
    enable_interrupts();

    DISPLAY_ON;
    if(THIS_GAME_MANAGER->current_scene != NULL && THIS_GAME_MANAGER->current_scene->window != NULL){
        SHOW_WIN;
    } else{
        HIDE_WIN;
    }
    SHOW_BKG;
    SHOW_SPRITES;
    
    while(1) {
        update_game();



        vsync();
    }
}
