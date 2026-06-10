#pragma bank 255
#include "SampleScene.h"
// RETROGBFULL CORE PLACEHOLDER SCENE

BANKREF(SampleScene_bankref)

void SINIT(void) BANKED{
    SampleScene* scene = (SampleScene*) THIS_SCENE;
    init_scene(&scene->base);
}

void SUPDATE(void) BANKED{
    update_actors();
    draw_actors();
}
