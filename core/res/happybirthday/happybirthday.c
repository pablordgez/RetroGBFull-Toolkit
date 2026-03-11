#pragma bank 255
#include "happybirthday.h"

BANKREF(happybirthday_bankref)

const Instrument happybirthday_instruments[] = {
    {0x00, 0x00, 0x00},
    {0x80, 0xF2, 0x00},
    {0x40, 0xC2, 0x00},
    {0x80, 0x92, 0x00},
    {0x00, 0xF1, 0x35}
};

const Pattern happybirthday_ch1_pat0 = {{
    {G_4, 1}, {NOTE_REST, 0}, {G_4, 2}, {NOTE_REST, 0}, 
    {A_4, 1}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0},
    {G_4, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, 
    {C_5, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}
}};

const Pattern happybirthday_ch2_pat0 = {{
    {E_4, 1}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0},
    {F_4, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0},
    {E_4, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0},
    {G_4, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}
}};

const Pattern happybirthday_ch4_pat0 = {{
    {1, 4}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0},
    {1, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0},
    {1, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0},
    {1, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}, {NOTE_REST, 0}
}};

const Pattern* const happybirthday_ch1_sequence[] = {
    &happybirthday_ch1_pat0
};

const Pattern* const happybirthday_ch2_sequence[] = {
    &happybirthday_ch2_pat0
};

const Pattern* const happybirthday_ch4_sequence[] = {
    &happybirthday_ch4_pat0
};