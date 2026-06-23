---
sidebar_position: 3
title: Input
---

## GBDK input

Input is handled directly through GBDK. The engine does not add its own input layer or button helpers.

That means you can read buttons with the usual functions and constants from `gb/gb.h`, which is already included for project scripts through `ScriptEnvironment.h`.

### Common functions

| Function | Description |
| --- | --- |
| `uint8_t joypad(void);` | Returns the current button state bitmask. |
| `uint8_t waitpad(uint8_t mask);` | Waits until one of the buttons in `mask` is pressed. |
| `void waitpadup(void);` | Waits until all buttons are released. |

### Common button constants

`J_LEFT`, `J_RIGHT`, `J_UP`, `J_DOWN`, `J_A`, `J_B`, `J_SELECT`, and `J_START`.

### Typical usage

Read input wherever it makes sense for your game logic, usually in a scene update or actor update function.

```c
void AUPDATE(void) BANKED {
    uint8_t keys = joypad();

    if(keys & J_LEFT) {
        move_actor(-16, 0);
    }
    if(keys & J_RIGHT) {
        move_actor(16, 0);
    }
    if(keys & J_UP) {
        move_actor(0, -16);
    }
    if(keys & J_DOWN) {
        move_actor(0, 16);
    }

    if(keys & J_A) {
        // Jump, interact, or trigger an action here.
    }
}
```

### Detecting a single press

If you only want to react once when a button is pressed, keep the previous state and compare it with the current one.

```c
static uint8_t previous_keys;

void SUPDATE(void) BANKED {
    uint8_t keys = joypad();

    if((keys & J_START) && !(previous_keys & J_START)) {
        // Runs once when Start is pressed.
    }

    previous_keys = keys;
}
```