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
#include "EngineSignature.h"
// BEGIN STARTING SCENE INCLUDE
#include "CustomScenes/SampleScene.h"
// END STARTING SCENE INCLUDE

SaveData save_data;

static void engine_idle_vblank_isr(void) NONBANKED{
}

void main(void)
{
    retrogbfull_retain_engine_signature();
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
    Scene* ss = create_scene(_SampleScene);
    if(ss != NULL){
        set_scene(ss);
    }
    // END STARTING SCENE INSTANTIATION
    enable_interrupts();

#if SPRITES_8X16_ENABLED
    LCDC_REG |= 0x04U;
#endif
    DISPLAY_ON;
    SHOW_BKG;
    SHOW_SPRITES;
    
    while(1) {
        update_game();


        vsync();
    }
}
