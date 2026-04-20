#ifndef SAVE_DATA_H
#define SAVE_DATA_H

#include <gb/gb.h>

typedef struct{
    uint8_t signature[4];

    // BEGIN SAVE DATA VARIABLES

    // END SAVE DATA VARIABLES

} SaveData;

extern SaveData save_data;

void init_save_data(void);
void load_save_data(void);
void save_save_data(void);

#endif // SAVE_DATA_H
