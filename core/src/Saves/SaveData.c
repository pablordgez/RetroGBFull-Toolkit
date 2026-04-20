#include "SaveData.h"
#include <string.h>

static SaveData sram_save_data;

void init_save_data(void){
    ENABLE_RAM;
    save_data.signature[0] = 'S';
    save_data.signature[1] = 'A';
    save_data.signature[2] = 'V';
    save_data.signature[3] = 'E';

    // BEGIN SAVE DATA VARIABLE INITIALIZATION

    // END SAVE DATA VARIABLE INITIALIZATION
    save_save_data();
    DISABLE_RAM;
}

void save_save_data(void){
    ENABLE_RAM;
    memcpy(&sram_save_data, &save_data, sizeof(SaveData));
    DISABLE_RAM;
}

void load_save_data(void){
    ENABLE_RAM;
    if(sram_save_data.signature[0] == 'S' && sram_save_data.signature[1] == 'A' &&
       sram_save_data.signature[2] == 'V' && sram_save_data.signature[3] == 'E'){
        memcpy(&save_data, &sram_save_data, sizeof(SaveData));
        DISABLE_RAM;
        return;
    }
    DISABLE_RAM;
    init_save_data();
}
