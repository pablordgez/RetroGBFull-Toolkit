#include "SaveData.h"
SaveData save_data;

void init_save_data(void){
    ENABLE_RAM;
    
    save_data.signature[0] = 'S';
    save_data.signature[1] = 'A';
    save_data.signature[2] = 'V';
    save_data.signature[3] = 'E';

    // BEGIN SAVE DATA VARIABLE INITIALIZATION


    // END SAVE DATA VARIABLE INITIALIZATION
    DISABLE_RAM;
}

void load_save_data(void){
    ENABLE_RAM;
    if(save_data.signature[0] == 'S' && save_data.signature[1] == 'A' && save_data.signature[2] == 'V' && save_data.signature[3] == 'E'){
        // BEGIN LOAD SAVE DATA VARIABLES

        // END LOAD SAVE DATA VARIABLES
    }
    DISABLE_RAM;
}

void save_save_data(void){
    ENABLE_RAM;
    // BEGIN SAVE SAVE DATA VARIABLES

    // END SAVE SAVE DATA VARIABLES
    DISABLE_RAM;
}
