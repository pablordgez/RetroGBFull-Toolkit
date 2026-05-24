#include <gb/gb.h>
#include <stdint.h>
#include <stdlib.h>
#include "Assets/Animations/AnimationRegistry.h"
#include "GameManager/GameManager.h"
#include "Saves/SaveData.h"
#include "Interrupts/InterruptManager.h"
#include "Window/WindowVisibility.h"
#include "Assets/Text/Text.h"
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
    init_window_visibility_system();
    init_text_system();
    add_vblank_interrupt_callback(engine_idle_vblank_isr);
    load_save_data();

    GameManager gm;
    THIS_GAME_MANAGER = &gm;
    gm.current_scene = NULL;
    gm.pending_scene = NULL;

    // BEGIN STARTING SCENE INSTANTIATION
    SampleScene* ss = (SampleScene*) malloc(sizeof(SampleScene));
    if(ss != NULL){
        ss->base.type = _SampleScene;
        set_scene((Scene*) ss);
    }
    // END STARTING SCENE INSTANTIATION
    enable_interrupts();

    DISPLAY_ON;
    SHOW_BKG;
    SHOW_SPRITES;
    
    while(1) {
        update_game();



        vsync();
    }
}
